import { GoogleGenAI } from "@google/genai";
import { ExtractionSchema, type Extraction } from "../pipeline/validators";
import { EXTRACTION_SYSTEM, EXTRACTION_JSON_SCHEMA, extractionUser } from "./prompts";

// The ONE module that talks to Gemini (R2). Gemini Flash only, temperature 0.
export const DEFAULT_MODEL = "gemini-3.8-flash";

export class GeminiCapError extends Error {}

let calls = 0;
export const geminiCalls = () => calls;
export const resetGeminiCalls = () => (calls = 0);

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  return new GoogleGenAI({ apiKey });
}

const model = () => process.env.GEMINI_MODEL || DEFAULT_MODEL;
const cap = () => Number(process.env.GEMINI_DAILY_CALL_CAP || 300);

async function generate(system: string, user: string, json?: object): Promise<string> {
  if (calls >= cap()) throw new GeminiCapError(`Gemini call cap ${cap()} reached`);
  calls++;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client().models.generateContent({
        model: model(),
        contents: [{ role: "user", parts: [{ text: user }] }],
        config: {
          systemInstruction: system,
          temperature: 0,
          ...(json ? { responseMimeType: "application/json", responseJsonSchema: json } : {}),
        },
      });
      return res.text ?? "";
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message ?? e);
      if (!/429|500|503|UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed/i.test(msg)) break;
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt)); // backoff
    }
  }
  throw lastErr;
}

/** Extract facts from one article. One retry on invalid JSON. Returns null if both attempts are invalid. */
export async function extractFacts(company: string, aliases: string[], title: string, text: string): Promise<Extraction | null> {
  const user = extractionUser(company, aliases, title, text.slice(0, 12_000));
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await generate(EXTRACTION_SYSTEM, user, EXTRACTION_JSON_SCHEMA);
    try {
      const parsed = ExtractionSchema.safeParse(JSON.parse(out));
      if (parsed.success) return parsed.data;
    } catch {
      /* invalid JSON, retry once */
    }
  }
  return null;
}

/** Short free text (angle, prep note, soft-touch draft). Dashes are stripped as a last guard. */
export async function writeText(prompt: string): Promise<string> {
  const out = await generate("You write short, plain business text. Follow every rule exactly.", prompt);
  return cleanText(out);
}

export function cleanText(s: string) {
  return s.replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/!/g, ".").replace(/\s+\n/g, "\n").trim();
}
