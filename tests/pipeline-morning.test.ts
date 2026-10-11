import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { runIngest } from "@/lib/pipeline/ingest";
import { runMorning, hotListWindow, acquireSendLock, hotListItems } from "@/lib/morning";
import { hotListHtml } from "@/lib/email/templates";
import { resendMailer } from "@/lib/email/send";
import { NOW, fixtureDeps, fakeMailer, fakeText } from "./helpers/fixtures";

let db: Db;
const DAY = 86_400_000;
async function account(name: string, extra = "") {
  return (await db.query<{ id: string }>(
    `insert into accounts (name, aliases, sector, employee_count, frontline_share, multi_site, is_active${extra ? "," + extra.split("=")[0] : ""})
     values ($1, '{}', 'retail', 1800, 'high', true, true${extra ? "," + extra.split("=")[1] : ""}) returning id`, [name])).rows[0].id;
}
beforeEach(async () => {
  process.env.ARJUN_EMAIL = "arjun@example.com";
  db = await createPgliteDb();
});
afterEach(async () => db.close());

describe("ingest on fixtures", () => {
  it("gates job ads and context sources, clusters two outlets into one event", async () => {
    const id = await account("Test Retail Co");
    const r = await runIngest(db, { now: NOW, deps: fixtureDeps() });
    expect(r.status).toBe("ok");
    expect(r.counts.gated_out.g3_content_type).toBe(1);
    expect(r.counts.gated_out.g4_context).toBe(1);
    const ev = (await db.query<{ source_count: number; source_domains: string[] }>("select source_count, source_domains from events where account_id = $1", [id])).rows;
    expect(ev).toHaveLength(1); // two duplicate articles, one event
    expect(ev[0].source_count).toBe(2);
    expect(ev[0].source_domains).toHaveLength(2);
    const quotes = (await db.query<{ evidence_quote: string }>("select evidence_quote from signals where gate_result = 'accepted'")).rows;
    for (const q of quotes) expect(q.evidence_quote.split(/\s+/).length).toBeLessThanOrEqual(25);
  });

  it("is idempotent: a second run skips seen URLs and makes no new events", async () => {
    await account("Test Retail Co");
    await runIngest(db, { now: NOW, deps: fixtureDeps() });
    const deps = fixtureDeps();
    const r2 = await runIngest(db, { now: NOW, deps });
    expect(deps.calls).toBe(0);
    expect(r2.counts.events_written).toBe(0);
    expect(r2.counts.skipped_seen).toBeGreaterThan(0);
  });

  it("a failing feed or Gemini marks the run partial and continues", async () => {
    await account("Test Retail Co");
    await account("Other Co");
    const r = await runIngest(db, { now: NOW, deps: fixtureDeps({
      discover: async (a) => { if (a.name === "Other Co") throw new Error("feed down"); return fixtureDeps().discover(a); },
      extract: async () => { throw new Error("gemini 500"); },
    }) });
    expect(r.status).toBe("partial");
    expect(r.errors.join(" ")).toMatch(/feed down/);
    const run = (await db.query<{ status: string }>("select status from runs where id = $1", [r.runId])).rows[0];
    expect(run.status).toBe("partial");
  });

  it("stops at the article cap and logs it", async () => {
    await account("Test Retail Co");
    const r = await runIngest(db, { now: NOW, deps: fixtureDeps(), maxArticles: 1 });
    expect(r.counts.stopped).toBe("max_articles");
  });
});

describe("Hot List window (D06)", () => {
  it("Thursday to Monday: since last send, which is longer than 3 days", () => {
    const thu = new Date("2026-10-08T02:30:00Z");
    const mon = new Date("2026-10-12T02:30:00Z");
    expect(hotListWindow(thu, mon).start).toEqual(thu);
  });
  it("minimum 3 days when the last send was recent or missing", () => {
    const now = new Date("2026-10-12T02:30:00Z");
    expect(hotListWindow(new Date(now.getTime() - DAY), now).start).toEqual(new Date(now.getTime() - 3 * DAY));
    expect(hotListWindow(null, now).start).toEqual(new Date(now.getTime() - 3 * DAY));
  });
});

describe("Hot List eligibility and emails", () => {
  it("only score >= 5 with an event in the window; never padded", async () => {
    const id = await account("Test Retail Co");
    await account("Quiet Co");
    await runIngest(db, { now: NOW, deps: fixtureDeps({ discover: async (a) => (a.name === "Quiet Co" ? [] : fixtureDeps().discover(a)) }) });
    const items = await hotListItems(db, new Date(NOW.getTime() - 3 * DAY), NOW, fakeText);
    expect(items.map((i) => i.name)).toEqual(["Test Retail Co"]);
    expect(items[0].sourceUrl).toMatch(/^https:\/\//);
    // an event outside the window does not qualify
    const later = await hotListItems(db, new Date(NOW.getTime() + DAY), NOW, fakeText);
    expect(later).toHaveLength(0);
    void id;
  });

  it("empty list sends the short note", () => {
    const { subject, html } = hotListHtml({ items: [], date: "12 Oct 2026", warmCount: 3, nextDay: "Thursday 15 Oct", stale: false, dashboardUrl: "https://x" });
    expect(subject).toBe("Hot List: 0 accounts to reach out to (12 Oct 2026)");
    expect(html).toContain("Nothing hot this time. 3 accounts are warm. Next list on Thursday 15 Oct.");
    expect(html).not.toMatch(/[—]/);
  });

  it("send lock: a second morning run on the same IST day sends nothing", async () => {
    await account("Test Retail Co");
    await runIngest(db, { now: NOW, deps: fixtureDeps() });
    const m = fakeMailer();
    await runMorning(db, { now: NOW, mailer: m, text: fakeText });
    expect(m.sent.map((s) => s.subject)).toEqual([expect.stringMatching(/^Hot List: 1 accounts/), expect.stringMatching(/^Morning brief/)]);
    const r2 = await runMorning(db, { now: new Date(NOW.getTime() + 3600_000), mailer: m, text: fakeText });
    expect(m.sent).toHaveLength(2);
    expect(r2.counts).toMatchObject({ hotlist: "already_sent", brief: "already_sent" });
    expect(await acquireSendLock(db, "brief", NOW, "arjun@example.com")).toBeNull();
  });

  it("Hot List only goes out on Monday and Thursday", async () => {
    const m = fakeMailer();
    const wed = new Date("2026-10-14T02:30:00Z");
    const r = await runMorning(db, { now: wed, mailer: m, text: fakeText });
    expect(r.counts.hotlist).toBe("not_today");
    expect(m.sent.map((s) => s.subject)[0]).toMatch(/^Morning brief/);
  });

  it("brief says data may be stale after a partial ingest", async () => {
    await account("Test Retail Co");
    await runIngest(db, { now: NOW, deps: fixtureDeps({ extract: async () => { throw new Error("down"); } }) });
    const m = fakeMailer();
    await runMorning(db, { now: NOW, mailer: m, text: fakeText });
    expect(m.sent.at(-1)!.html).toContain("Data may be stale");
  });

  it("a failed send releases the lock so a retry can send", async () => {
    const bad = { send: async () => { throw new Error("resend down"); } };
    await expect(runMorning(db, { now: new Date("2026-10-14T02:30:00Z"), mailer: bad, text: fakeText })).rejects.toThrow();
    const m = fakeMailer();
    await runMorning(db, { now: new Date("2026-10-14T03:30:00Z"), mailer: m, text: fakeText });
    expect(m.sent).toHaveLength(1);
  });

  it("R6: the mailer refuses any recipient other than ARJUN_EMAIL", async () => {
    await expect(resendMailer.send("prospect@company.com", "x", "y")).rejects.toThrow(/ARJUN_EMAIL/);
  });
});
