import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { runIngest } from "@/lib/pipeline/ingest";
import { runMorning, hotListWindow, acquireSendLock } from "@/lib/morning";
import { buildHotList, crmBrief } from "@/lib/hotlist";
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

  it("the same story on Sunday and Monday (two ISO weeks) is one event", async () => {
    const { upsertEvent } = await import("@/lib/pipeline/ingest");
    const id = await account("Test Retail Co");
    const ev = { type: "OPERATIONAL_CHALLENGE" as const, subject: null, subject_title: null, magnitude: "medium" as const, certainty: "confirmed" as const, time_scope: "new" as const, quote: "q", summary: "s", competitor: null, notes: [] };
    const sig = async (u: string) => (await db.query<{ id: string }>("insert into signals (account_id, url, url_hash, gate_result) values ($1,$2,$2,'accepted') returning id", [id, u])).rows[0].id;
    await upsertEvent(db, id, ev, await sig("https://a.test/1"), new Date("2026-10-11T10:00:00Z"), "T2", "economictimes.indiatimes.com");
    const r = await upsertEvent(db, id, ev, await sig("https://b.test/2"), new Date("2026-10-12T10:00:00Z"), "T2", "retail.economictimes.indiatimes.com");
    expect(r.merged).toBe(true);
    const rows = (await db.query<{ source_count: number }>("select source_count from events where account_id = $1", [id])).rows;
    expect(rows).toEqual([{ source_count: 2 }]);
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

  it("a failing Gemini marks the run partial and continues", async () => {
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

  it("one unreachable feed is logged, not a partial run; every feed down is", async () => {
    await account("Test Retail Co");
    await account("Other Co");
    const one = await runIngest(db, { now: NOW, deps: fixtureDeps({
      discover: async (a) => { if (a.name === "Other Co") throw new Error("no feed reachable"); return fixtureDeps().discover(a); } }) });
    expect(one.status).toBe("ok");
    expect(one.counts.feed_errors).toBe(1);
    expect(one.errors.join(" ")).toMatch(/Other Co: no feed reachable/);
    const all = await runIngest(db, { now: NOW, deps: fixtureDeps({ discover: async () => { throw new Error("no feed reachable"); } }) });
    expect(all.status).toBe("partial");
  });

  it("a run stopped by its time limit resumes from that account next time", async () => {
    for (const n of ["A Co", "B Co", "C Co"]) await account(n);
    const seen: string[] = [];
    const deps = (slow: boolean) => fixtureDeps({ discover: async (a) => {
      seen.push(a.name);
      if (slow) await new Promise((r) => setTimeout(r, 60));
      return [];
    } });
    const r1 = await runIngest(db, { now: NOW, deps: deps(true), timeBudgetMs: 30 });
    expect(r1.status).toBe("partial");
    expect(r1.counts).toMatchObject({ stopped: "time_budget", resume_from: "B Co", accounts_checked: 1, accounts_total: 3 });
    seen.length = 0;
    const r2 = await runIngest(db, { now: new Date(NOW.getTime() + DAY), deps: deps(false) });
    expect(seen).toEqual(["B Co", "C Co", "A Co"]);
    expect(r2.status).toBe("ok");
    expect(r2.counts.resume_from).toBeUndefined();
  });

  it("a publisher timeout is a skipped article, not a partial run", async () => {
    await account("Test Retail Co");
    const r = await runIngest(db, { now: NOW, deps: fixtureDeps({ fetchArticle: async () => { throw new Error("This operation was aborted"); } }) });
    expect(r.status).toBe("ok");
    expect(r.counts.gated_out.fetch_timeout).toBeGreaterThan(0);
  });

  it("stops at the article cap and logs it", async () => {
    await account("Test Retail Co");
    const r = await runIngest(db, { now: NOW, deps: fixtureDeps(), maxArticles: 1 });
    expect(r.counts.stopped).toBe("max_articles");
  });
});

describe("history mode (context only, never scored)", () => {
  it("a verified 40-day-old article is stored as history with no event; normal mode drops it as stale", async () => {
    const { processArticle } = await import("@/lib/pipeline/ingest");
    const { newCounts } = await import("@/lib/pipeline/runs");
    const id = await account("Test Retail Co");
    const acc = { id, name: "Test Retail Co", aliases: [], domain: null, newsroom_rss: null, is_active: true };
    const old = new Date(NOW.getTime() - 40 * DAY);
    const deps = fixtureDeps({ fetchArticle: async (url: string) => ({ url, title: "Test Retail Co names Asha Rao CHRO", text: (await fixtureDeps().fetchArticle(url) as { text: string }).text, published_at: old }) });
    const item = { title: "Test Retail Co names Asha Rao CHRO", link: "https://hr.economictimes.indiatimes.com/news/old/1", published_at: old, source_name: null, source_url: null };
    await processArticle(db, acc, item, deps, newCounts(), NOW);
    expect((await db.query<{ gate_result: string }>("select gate_result from signals")).rows[0].gate_result).toBe("g2_stale");
    await processArticle(db, acc, item, deps, newCounts(), NOW, false, 90);
    expect((await db.query<{ gate_result: string }>("select gate_result from signals")).rows.map((r) => r.gate_result)).toEqual(["history"]);
    expect((await db.query("select 1 from events")).rows).toHaveLength(0);
  });
});

describe("Hot List window (B08, daily)", () => {
  it("since the last send when that is longer than a day (for example a missed day)", () => {
    const twoDaysAgo = new Date("2026-10-10T02:30:00Z");
    const now = new Date("2026-10-12T02:30:00Z");
    expect(hotListWindow(twoDaysAgo, now).start).toEqual(twoDaysAgo);
  });
  it("minimum 1 day after a recent send, 3 days for the very first send", () => {
    const now = new Date("2026-10-12T02:30:00Z");
    expect(hotListWindow(new Date(now.getTime() - 3600_000), now).start).toEqual(new Date(now.getTime() - DAY));
    expect(hotListWindow(null, now).start).toEqual(new Date(now.getTime() - 3 * DAY));
  });
});

describe("Hot List eligibility and emails", () => {
  it("only score >= 5 with a fresh qualifying event; never padded; items carry why, articles and the CRM brief", async () => {
    await account("Test Retail Co");
    await account("Quiet Co");
    await runIngest(db, { now: NOW, deps: fixtureDeps({ discover: async (a) => (a.name === "Quiet Co" ? [] : fixtureDeps().discover(a)) }) });
    const list = await buildHotList(db, new Date(NOW.getTime() - 3 * DAY), NOW, fakeText);
    expect(list.items.map((i) => i.name)).toEqual(["Test Retail Co"]);
    const it0 = list.items[0];
    expect(it0.articles.length).toBe(2);
    expect(it0.articles[0].url).toMatch(/^https:\/\//);
    expect(it0.why.length).toBeGreaterThan(0);
    expect(it0.crm.stage).toBe("Not in HubSpot yet");
  });

  it("next day: an account already sent shows as an update only when a new article arrives", async () => {
    const id = await account("Test Retail Co");
    await runIngest(db, { now: NOW, deps: fixtureDeps() });
    const m = fakeMailer();
    await runMorning(db, { now: NOW, mailer: m, text: fakeText });
    // Day 2, nothing new: still on the list, no detail
    const day2 = new Date(NOW.getTime() + DAY);
    let list = await buildHotList(db, hotListWindow(NOW, day2).start, day2, fakeText);
    expect(list.items).toHaveLength(0);
    expect(list.updates).toHaveLength(0);
    expect(list.stillHot.map((s) => s.name)).toEqual(["Test Retail Co"]);
    // A continuation article arrives on day 2
    const sig = (await db.query<{ id: string }>(
      `insert into signals (account_id, url, url_hash, publisher, tier, published_at, fetched_at, title, evidence_quote, extraction, gate_result)
       values ($1, 'https://www.business-standard.com/x', 'h-x', 'Business Standard', 'T2', $2, $2, 'Test Retail Co CHRO outlines HR plan', 'outlines HR plan', '{"one_line_summary":"New CHRO outlines HR plan."}', 'accepted') returning id`,
      [id, new Date(day2.getTime() - 3600_000)])).rows[0].id;
    void sig;
    list = await buildHotList(db, hotListWindow(NOW, day2).start, day2, fakeText);
    expect(list.updates.map((u) => u.name)).toEqual(["Test Retail Co"]);
    expect(list.updates[0].articles.filter((a) => a.isNew).map((a) => a.publisher)).toEqual(["Business Standard"]);
  });

  it("CRM brief: stage, deal status, last touch and open tasks from HubSpot-synced rows", async () => {
    const id = await account("Test Retail Co");
    await db.tx(async (q) => {
      await q.query("select set_config('app.writer','crm',true)");
      await q.query("update accounts set hubspot_company_id = '1', stage = 'Closed Won', is_customer = true, crm_is_demo = true where id = $1", [id]);
    });
    await db.query("insert into activities (account_id, kind, direction, occurred_at, summary) values ($1, 'call', 'inbound', $2, '[DEMO] Asked about payroll')", [id, new Date(NOW.getTime() - 4 * DAY)]);
    await db.query("insert into activities (account_id, kind, occurred_at, summary) values ($1, 'meeting', $2, 'Kickoff')", [id, new Date(NOW.getTime() - 180 * DAY)]);
    await db.query("insert into tasks (account_id, title, due_at) values ($1, 'Send QBR deck', $2)", [id, new Date(NOW.getTime() + 2 * DAY)]);
    const c = await crmBrief(db, { id, stage: "Closed Won", is_customer: true, crm_is_demo: true, hubspot_company_id: "1", hubspot_deal_id: null }, NOW);
    expect(c.stage).toBe("Deal won (customer)");
    expect(c.lastTouch).toMatch(/^call \(inbound\) on .*: Asked about payroll$/);
    expect(c.daysSinceTouch).toBe(4);
    expect(c.activity15d).toBe(1);
    expect(c.relationshipSince).toMatch(/Apr 2026/);
    expect(c.openTaskCount).toBe(1);
    expect(c.demo).toBe(true);
  });

  it("empty list sends the short note", () => {
    const { subject, html } = hotListHtml({ items: [], date: "12 Oct 2026", warmCount: 3, nextDay: "Thursday 15 Oct", dataNote: null, dashboardUrl: "https://x" });
    expect(subject).toBe("Hot List: 0 accounts to reach out to (12 Oct 2026)");
    expect(html).toContain("Nothing hot this time. 3 accounts are warm. Next list on Thursday 15 Oct.");
    expect(html).not.toContain("Still on the list");
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

  it("Hot List goes out every day, including midweek", async () => {
    const m = fakeMailer();
    const wed = new Date("2026-10-14T02:30:00Z");
    const r = await runMorning(db, { now: wed, mailer: m, text: fakeText });
    expect(r.counts.hotlist).toEqual({ new: 0, updates: 0, still: 0 });
    expect(m.sent.map((s) => s.subject)).toEqual([expect.stringMatching(/^Hot List: 0/), expect.stringMatching(/^Morning brief/)]);
  });

  it("a partial ingest gets a coverage note, not 'stale'; a failed or day-old one is stale", async () => {
    await account("Test Retail Co");
    await runIngest(db, { now: NOW, deps: fixtureDeps({ extract: async () => { throw new Error("down"); } }) });
    const m = fakeMailer();
    const r = await runMorning(db, { now: NOW, mailer: m, text: fakeText });
    expect(r.counts.stale).toBe(false);
    expect(m.sent.at(-1)!.html).toContain("skipped some articles");
    expect(m.sent.at(-1)!.html).not.toContain("Data may be stale");

    const { ingestNote } = await import("@/lib/pipeline/runs");
    const at = NOW.toISOString();
    expect(ingestNote({ status: "ok", started_at: at }, NOW)).toBeNull();
    expect(ingestNote({ status: "partial", started_at: at, counts: { stopped: "time_budget", accounts_checked: 40, accounts_total: 73 } }, NOW)!.text)
      .toBe("The last ingest checked 40 of 73 accounts before its time limit. The next run starts with the rest.");
    expect(ingestNote({ status: "failed", started_at: at }, NOW)!.stale).toBe(true);
    expect(ingestNote({ status: "ok", started_at: new Date(NOW.getTime() - 27 * 3600_000) }, NOW)!.stale).toBe(true);
    expect(ingestNote(null, NOW)!.stale).toBe(true);
  });

  it("a failed send releases the lock so a retry can send", async () => {
    const bad = { send: async () => { throw new Error("resend down"); } };
    await expect(runMorning(db, { now: new Date("2026-10-14T02:30:00Z"), mailer: bad, text: fakeText })).rejects.toThrow();
    const m = fakeMailer();
    await runMorning(db, { now: new Date("2026-10-14T03:30:00Z"), mailer: m, text: fakeText });
    expect(m.sent).toHaveLength(2);
  });

  it("a lock left 'pending' by a killed job is taken over after 15 minutes; a 'sent' lock never is", async () => {
    const t0 = new Date("2026-10-13T03:03:00Z");
    const first = await acquireSendLock(db, "hotlist", t0, "arjun@example.com");
    expect(first).not.toBeNull();
    expect(await acquireSendLock(db, "hotlist", new Date(t0.getTime() + 5 * 60_000), "arjun@example.com")).toBeNull();
    const taken = await acquireSendLock(db, "hotlist", new Date(t0.getTime() + 20 * 60_000), "arjun@example.com");
    expect(taken).toBe(first);
    await db.query("update sends set status = 'sent' where id = $1", [taken]);
    expect(await acquireSendLock(db, "hotlist", new Date(t0.getTime() + 60 * 60_000), "arjun@example.com")).toBeNull();
  });

  it("a run stuck at 'running' is marked failed when the next run of that job starts", async () => {
    const { startRun } = await import("@/lib/pipeline/runs");
    const t0 = new Date("2026-10-13T03:03:00Z");
    const stuck = await startRun(db, "morning", t0);
    await startRun(db, "morning", new Date(t0.getTime() + 20 * 60_000));
    const r = (await db.query<{ status: string }>("select status from runs where id = $1", [stuck])).rows[0];
    expect(r.status).toBe("failed");
  });

  it("R6: the mailer refuses any recipient other than ARJUN_EMAIL", async () => {
    await expect(resendMailer.send("prospect@company.com", "x", "y")).rejects.toThrow(/ARJUN_EMAIL/);
  });
});
