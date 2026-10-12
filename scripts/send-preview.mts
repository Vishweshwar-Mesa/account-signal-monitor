// Sends a PREVIEW of today's Hot List to ARJUN_EMAIL from the current database, without using or changing the send lock.
// The daily cron still sends the real list. Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/send-preview.mts
import { createPostgresDb } from "../src/lib/db";
import { buildHotList, hotListWindow } from "../src/lib/hotlist";
import { hotListHtml } from "../src/lib/email/templates";
import { resendMailer, arjunEmail } from "../src/lib/email/send";
import { writeText } from "../src/lib/ai/gemini";
import { fmtIst, appUrl } from "../src/lib/time";

const db = await createPostgresDb(process.env.DATABASE_URL!);
const now = new Date();
const list = await buildHotList(db, hotListWindow(null, now).start, now, writeText);
// Preview treats every account as new, so the full detail shows.
const all = { items: [...list.items, ...list.updates], updates: [], stillHot: list.stillHot };
const warm = Number((await db.query<{ n: string }>("select count(*) n from accounts where band = 'warm'")).rows[0].n);
const { subject, html } = hotListHtml({ ...all, date: fmtIst(now, { day: "numeric", month: "short", year: "numeric" }), warmCount: warm, nextDay: "tomorrow", stale: false, dashboardUrl: appUrl() === "http://localhost:3000" ? "https://account-signal-monitor.vercel.app" : appUrl() });
await resendMailer.send(arjunEmail(), `[Preview] ${subject}`, html);
console.log("sent preview:", subject, "| items:", all.items.map((i) => `${i.name} ${i.score}`).join(", "), "| still:", list.stillHot.length);
await db.close();
