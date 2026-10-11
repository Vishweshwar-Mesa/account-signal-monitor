import type { Db } from "./db";
import { softTouchPrompt, type Tone } from "./ai/prompts";
import { writeText } from "./ai/gemini";
import { updateAccountSystemColumns } from "./accounts-write";

// D11: the soft-touch draft is engagement only. It cites the verified fact, makes one observation and asks one light question.
// It is stored in system_draft. Arjun's edited copy lives in my_draft, which this module never touches.

const PITCH = /\b(keka|our (product|platform|solution|software)|pricing|price|discount|demo|free trial|book a (call|meeting)|schedule a (call|meeting))\b/i;
const URGENCY = /\b(urgent|asap|limited time|act now|right away|immediately|don't miss)\b/i;

export function checkDraft(text: string, publisher: string): string | null {
  const words = text.trim().split(/\s+/).length;
  if (words < 45 || words > 110) return `length ${words} words`;
  if (/[\u2014\u2013]/.test(text)) return "dash";
  if (PITCH.test(text)) return "pitch or product claim";
  if (URGENCY.test(text)) return "urgency language";
  if (publisher && !text.toLowerCase().includes(publisher.toLowerCase().split(" ")[0])) return "does not cite the publication";
  return null;
}

export async function generateSoftTouch(db: Db, accountId: string, tone: Tone, text: (p: string) => Promise<string> = writeText) {
  const a = (await db.query<{ name: string }>("select name from accounts where id = $1", [accountId])).rows[0];
  if (!a) throw new Error("account not found");
  const ev = (await db.query<{ summary: string; evidence_signal_ids: string[] }>(
    "select summary, evidence_signal_ids from events where account_id = $1 and best_tier in ('T1','T2') order by points desc limit 1",
    [accountId],
  )).rows[0];
  if (!ev) throw new Error("No verified signal to cite, so no draft. Drafts always cite a fact.");
  const sig = (await db.query<{ publisher: string }>("select publisher from signals where id = any($1) order by tier limit 1", [ev.evidence_signal_ids])).rows[0];
  const person = (await db.query<{ name: string }>(
    "select name from people where account_id = $1 and removed_at is null order by case role_group when 'hr_head' then 0 else 1 end limit 1",
    [accountId],
  )).rows[0];
  const publisher = sig?.publisher ?? "the press";
  const prompt = softTouchPrompt({ company: a.name, person: person?.name ?? null, fact: ev.summary, publisher, tone });
  let draft = "";
  let problem: string | null = "not generated";
  for (let i = 0; i < 2 && problem; i++) {
    draft = await text(prompt);
    problem = checkDraft(draft, publisher);
  }
  if (problem) throw new Error(`Draft failed checks (${problem}). Try another tone.`);
  await updateAccountSystemColumns(db, accountId, { system_draft: draft, draft_tone: tone });
  return draft;
}
