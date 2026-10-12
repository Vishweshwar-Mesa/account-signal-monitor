import type { Db } from "../db";
import { hubspotClient, HubspotError, SCOPES_NEEDED, type Hs } from "./client";
import { updateAccountCrmColumns } from "../accounts-write";
import { dateOnly } from "../time";

// HubSpot integration (section 10 and the addendum). D08: a missing token or a failed call never stops a run.
// The system never edits deal stages in HubSpot. It only reads them and maps them to accounts.stage (CRM-owned).

export const PIPELINE_LABEL = "Enterprise Leads";
export const STAGES = [
  { label: "Identified", probability: 0.1 },
  { label: "Outreach", probability: 0.2 },
  { label: "Discovery", probability: 0.35 },
  { label: "Qualified", probability: 0.5 },
  { label: "Pilot", probability: 0.65 },
  { label: "Negotiation", probability: 0.8 },
  { label: "Closed Won", probability: 1.0, closed: true },
  { label: "Closed Lost", probability: 0.0, closed: true },
] as const;
export type StageLabel = (typeof STAGES)[number]["label"];
export const RETENTION_TASK = "Retention check-in, signal detected";

export type PipelinePath = "enterprise_pipeline" | "default_pipeline" | "company_property";
export interface PipelineInfo {
  path: PipelinePath;
  pipelineId: string | null;
  stageIdByLabel: Record<string, string>;
  labelByStageId: Record<string, string>;
}

const BANDS = ["hot", "warm", "cold"];
const LANES = ["outreach", "churn_risk", "expansion", "re_engage"];
const opt = (vals: readonly string[]) => vals.map((v, i) => ({ label: v, value: v, displayOrder: i }));

const COMPANY_PROPS = [
  { name: "sm_score", label: "SM score", type: "number", fieldType: "number" },
  { name: "sm_band", label: "SM band", type: "enumeration", fieldType: "select", options: opt(BANDS) },
  { name: "sm_lane", label: "SM lane", type: "enumeration", fieldType: "select", options: opt(LANES) },
  { name: "sm_top_signal", label: "SM top signal", type: "string", fieldType: "text" },
  { name: "sm_top_signal_url", label: "SM top signal URL", type: "string", fieldType: "text" },
  { name: "sm_last_signal_at", label: "SM last signal at", type: "datetime", fieldType: "date" },
  { name: "sm_updated_at", label: "SM updated at", type: "datetime", fieldType: "date" },
  { name: "sm_signal_history", label: "SM signal history (last 90 days)", type: "string", fieldType: "textarea" },
  { name: "sm_relationship_stage", label: "SM relationship stage", type: "enumeration", fieldType: "select", options: opt(STAGES.map((s) => s.label)) },
  { name: "sm_renewal_date", label: "SM renewal date", type: "date", fieldType: "date" },
  { name: "sm_demo", label: "SM demo record", type: "bool", fieldType: "booleancheckbox", options: [{ label: "Yes", value: "true", displayOrder: 0 }, { label: "No", value: "false", displayOrder: 1 }] },
];

/** Idempotent: check, then create the "Signal Monitor" group and the sm_ properties (companies) and sm_demo (deals). */
export async function ensureProperties(hs: Hs) {
  const created: string[] = [];
  const groups = await hs.req<{ results: { name: string }[] }>("GET", "/crm/v3/properties/companies/groups");
  if (!groups.results.some((g) => g.name === "signal_monitor")) {
    await hs.req("POST", "/crm/v3/properties/companies/groups", { name: "signal_monitor", label: "Signal Monitor", displayOrder: -1 });
    created.push("group");
  }
  const existing = await hs.req<{ results: { name: string }[] }>("GET", "/crm/v3/properties/companies");
  const have = new Set(existing.results.map((p) => p.name));
  for (const p of COMPANY_PROPS) {
    if (have.has(p.name)) continue;
    await hs.req("POST", "/crm/v3/properties/companies", { ...p, groupName: "signal_monitor" });
    created.push(p.name);
  }
  const dealProps = await hs.req<{ results: { name: string }[] }>("GET", "/crm/v3/properties/deals");
  if (!dealProps.results.some((p) => p.name === "sm_demo")) {
    await hs.req("POST", "/crm/v3/properties/deals", { ...COMPANY_PROPS.find((p) => p.name === "sm_demo"), groupName: "dealinformation" });
    created.push("deal.sm_demo");
  }
  return created;
}

interface HsPipeline { id: string; label: string; stages: { id: string; label: string }[] }

function info(path: PipelinePath, p: HsPipeline | null): PipelineInfo {
  const stageIdByLabel: Record<string, string> = {};
  const labelByStageId: Record<string, string> = {};
  for (const s of p?.stages ?? []) {
    stageIdByLabel[s.label] = s.id;
    labelByStageId[s.id] = s.label;
  }
  return { path, pipelineId: p?.id ?? null, stageIdByLabel, labelByStageId };
}

/**
 * Idempotent: find or create the "Enterprise Leads" deal pipeline.
 * If the plan allows only one deal pipeline, add the missing stages to the default pipeline (deleting nothing).
 * If that also fails, fall back to the sm_relationship_stage company property.
 */
export async function ensurePipeline(hs: Hs): Promise<PipelineInfo & { note?: string }> {
  const list = await hs.req<{ results: HsPipeline[] }>("GET", "/crm/v3/pipelines/deals");
  const found = list.results.find((p) => p.label === PIPELINE_LABEL);
  if (found) return info("enterprise_pipeline", found);
  try {
    const created = await hs.req<HsPipeline>("POST", "/crm/v3/pipelines/deals", {
      label: PIPELINE_LABEL,
      displayOrder: 1,
      stages: STAGES.map((s, i) => ({
        label: s.label,
        displayOrder: i,
        metadata: { probability: String(s.probability), ...("closed" in s ? { isClosed: "true" } : {}) },
      })),
    });
    return info("enterprise_pipeline", created);
  } catch (e) {
    const firstErr = (e as Error).message;
    const def = list.results.find((p) => p.id === "default") ?? list.results[0];
    if (def) {
      try {
        const have = new Set(def.stages.map((s) => s.label));
        for (const [i, s] of STAGES.entries()) {
          if (have.has(s.label)) continue;
          await hs.req("POST", `/crm/v3/pipelines/deals/${def.id}/stages`, {
            label: s.label, displayOrder: 100 + i, metadata: { probability: String(s.probability), ...("closed" in s ? { isClosed: "true" } : {}) },
          });
        }
        const fresh = await hs.req<HsPipeline>("GET", `/crm/v3/pipelines/deals/${def.id}`);
        return { ...info("default_pipeline", fresh), note: `Enterprise Leads pipeline could not be created (${firstErr.slice(0, 120)}). Stages added to the default pipeline.` };
      } catch (e2) {
        return { ...info("company_property", null), note: `No pipeline available (${(e2 as Error).message.slice(0, 120)}). Using sm_relationship_stage.` };
      }
    }
    return { ...info("company_property", null), note: "No deal pipelines readable. Using sm_relationship_stage." };
  }
}

export async function ownerIdFor(hs: Hs, email: string) {
  const r = await hs.req<{ results: { id: string; email: string }[] }>("GET", `/crm/v3/owners?email=${encodeURIComponent(email)}&limit=100`);
  const o = r.results.find((x) => x.email.toLowerCase() === email.toLowerCase());
  if (!o) throw new Error(`No HubSpot owner with email ${email}`);
  return o.id;
}

/** Deal stage id to account fields. Closed Won means customer. */
export function mapDealStage(pipe: PipelineInfo, dealstage: string | null | undefined): { stage: StageLabel | null; is_customer: boolean } {
  const label = dealstage ? pipe.labelByStageId[dealstage] : undefined;
  const stage = (STAGES.find((s) => s.label === label)?.label ?? null) as StageLabel | null;
  return { stage, is_customer: stage === "Closed Won" };
}

interface SearchResult { id: string; properties: Record<string, string | null> }
async function searchAll(hs: Hs, object: string, filters: { propertyName: string; operator: string; value?: string }[], properties: string[]) {
  const out: SearchResult[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await hs.req<{ results: SearchResult[]; paging?: { next?: { after: string } } }>("POST", `/crm/v3/objects/${object}/search`, {
      filterGroups: [{ filters }], properties, limit: 100, ...(after ? { after } : {}),
    });
    out.push(...r.results);
    after = r.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

export async function assocToCompanies(hs: Hs, from: string, ids: string[]) {
  const map = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await hs.req<{ results: { from: { id: string }; to: { toObjectId: string | number }[] }[] }>(
      "POST", `/crm/v4/associations/${from}/companies/batch/read`, { inputs: ids.slice(i, i + 100).map((id) => ({ id })) });
    for (const x of r.results) if (x.to[0]) map.set(String(x.from.id), String(x.to[0].toObjectId));
  }
  return map;
}

export async function associate(hs: Hs, from: string, fromId: string, toCompanyId: string) {
  await hs.req("PUT", `/crm/v4/objects/${from}/${fromId}/associations/default/companies/${toCompanyId}`);
}

const ACTIVITY_OBJECTS = [
  { object: "calls", kind: "call", props: ["hs_timestamp", "hs_call_title", "hs_call_body", "hs_call_direction"], summary: (p: Record<string, string | null>) => p.hs_call_title || p.hs_call_body, inbound: (p: Record<string, string | null>) => p.hs_call_direction === "INBOUND" },
  { object: "emails", kind: "email", props: ["hs_timestamp", "hs_email_subject", "hs_email_direction"], summary: (p: Record<string, string | null>) => p.hs_email_subject, inbound: (p: Record<string, string | null>) => p.hs_email_direction === "INCOMING_EMAIL" },
  { object: "meetings", kind: "meeting", props: ["hs_timestamp", "hs_meeting_title", "hs_meeting_start_time"], summary: (p: Record<string, string | null>) => p.hs_meeting_title, inbound: () => false },
  { object: "notes", kind: "note", props: ["hs_timestamp", "hs_note_body"], summary: (p: Record<string, string | null>) => (p.hs_note_body ?? "").replace(/<[^>]+>/g, "").slice(0, 200), inbound: () => false },
] as const;

export interface SyncResult {
  status: "synced" | "not_configured" | "failed" | "partial";
  path?: PipelinePath;
  note?: string;
  counts?: Record<string, number>;
  error?: string;
  scopesHint?: string;
}

export function hubspotFrom(opts: { hs?: Hs } = {}): Hs | null {
  if (opts.hs) return opts.hs;
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  return token ? hubspotClient(token) : null;
}

/** Daily sync inside the ingest run. Writes only CRM_COLS on accounts. */
export async function syncHubspot(db: Db, opts: { hs?: Hs; now?: Date } = {}): Promise<SyncResult> {
  const hs = hubspotFrom(opts);
  if (!hs) return { status: "not_configured" };
  const counts: Record<string, number> = { companies: 0, new_accounts: 0, deals: 0, crm_updates: 0, tasks: 0, activities: 0, pushed: 0, retention_tasks: 0 };
  const errors: string[] = [];
  try {
    const email = process.env.ARJUN_EMAIL ?? "";
    const owner = await ownerIdFor(hs, email);
    const pipe = await ensurePipeline(hs);

    // 1. Companies and deals owned by Arjun
    const companies = await searchAll(hs, "companies", [{ propertyName: "hubspot_owner_id", operator: "EQ", value: owner }], ["name", "domain", "sm_demo", "sm_renewal_date", "sm_relationship_stage"]);
    counts.companies = companies.length;
    let dealByCompany = new Map<string, SearchResult>();
    if (pipe.pipelineId) {
      const deals = await searchAll(hs, "deals", [
        { propertyName: "pipeline", operator: "EQ", value: pipe.pipelineId },
        { propertyName: "hubspot_owner_id", operator: "EQ", value: owner },
      ], ["dealname", "dealstage", "sm_demo", "hs_lastmodifieddate"]);
      counts.deals = deals.length;
      const assoc = await assocToCompanies(hs, "deals", deals.map((d) => d.id));
      dealByCompany = new Map();
      for (const d of deals) {
        const c = assoc.get(d.id);
        if (c) dealByCompany.set(c, d);
      }
    }

    // 2. Upsert accounts. New HubSpot companies for Arjun are picked up automatically.
    for (const c of companies) {
      const name = (c.properties.name ?? "").trim();
      if (!name) continue;
      let row = (await db.query<Record<string, unknown>>(
        "select id, is_active, hubspot_company_id, hubspot_deal_id, stage, is_customer, renewal_date, owner_email, crm_is_demo from accounts where hubspot_company_id = $1 or lower(name) = lower($2) limit 1",
        [c.id, name])).rows[0];
      if (!row) {
        const domain = c.properties.domain ?? null;
        row = (await db.query<Record<string, unknown>>(
          "insert into accounts (name, domain) values ($1, $2) on conflict (lower(name)) do nothing returning id, is_active, hubspot_company_id, hubspot_deal_id, stage, is_customer, renewal_date, owner_email, crm_is_demo",
          [name, domain])).rows[0];
        if (!row) continue;
        counts.new_accounts++;
      }
      const deal = dealByCompany.get(c.id);
      const mapped = deal ? mapDealStage(pipe, deal.properties.dealstage) : pipe.path === "company_property"
        ? { stage: (c.properties.sm_relationship_stage as StageLabel) ?? null, is_customer: c.properties.sm_relationship_stage === "Closed Won" }
        : { stage: null, is_customer: false };
      const patch: Record<string, unknown> = {
        hubspot_company_id: c.id,
        hubspot_deal_id: deal?.id ?? null,
        stage: mapped.stage,
        is_customer: mapped.is_customer,
        is_active: Boolean(mapped.stage),
        owner_email: email,
        renewal_date: c.properties.sm_renewal_date || null,
        crm_is_demo: c.properties.sm_demo === "true" || deal?.properties.sm_demo === "true",
      };
      const current = (k: string) => {
        const v = row![k];
        if (k === "renewal_date") return dateOnly(v);
        return v ?? null;
      };
      const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => String(current(k)) !== String(v ?? null)));
      if (Object.keys(changed).length) {
        await updateAccountCrmColumns(db, row.id as string, changed);
        counts.crm_updates++;
      }
    }

    // 3. Pull tasks and activities from HubSpot so changes made there reach the dashboard.
    const accountByCompany = new Map(
      (await db.query<{ id: string; hubspot_company_id: string }>("select id, hubspot_company_id from accounts where hubspot_company_id is not null")).rows
        .map((r) => [r.hubspot_company_id, r.id]),
    );
    try {
      const tasks = await searchAll(hs, "tasks", [{ propertyName: "hubspot_owner_id", operator: "EQ", value: owner }], ["hs_task_subject", "hs_task_status", "hs_timestamp"]);
      const tAssoc = await assocToCompanies(hs, "tasks", tasks.map((t) => t.id));
      for (const t of tasks) {
        const acc = accountByCompany.get(tAssoc.get(t.id) ?? "");
        if (!acc) continue;
        const title = t.properties.hs_task_subject ?? "Task";
        const done = t.properties.hs_task_status === "COMPLETED";
        // Link to a matching unlinked seed row first, so demo rows are not duplicated.
        const linked = await db.query(
          `update tasks set hubspot_id = $1, title = $3, due_at = $4, done = $5
           where id = (select id from tasks where account_id = $2 and hubspot_id is null and title = replace($3, '[DEMO] ', '') limit 1) returning id`,
          [t.id, acc, title, t.properties.hs_timestamp, done]);
        if (!linked.rows.length) {
          await db.query(
            `insert into tasks (account_id, title, due_at, done, hubspot_id, source) values ($1,$2,$3,$4,$5,'hubspot')
             on conflict (hubspot_id) do update set title = excluded.title, due_at = excluded.due_at, done = excluded.done`,
            [acc, title, t.properties.hs_timestamp, done, t.id]);
        }
        counts.tasks++;
      }
      for (const a of ACTIVITY_OBJECTS) {
        let items: SearchResult[] = [];
        try {
          items = await searchAll(hs, a.object, [{ propertyName: "hubspot_owner_id", operator: "EQ", value: owner }], [...a.props]);
        } catch (e) {
          // One missing scope (emails need sales-email-read) must not block the other activity types.
          errors.push(`${a.object}: ${(e as Error).message.slice(0, 120)}`);
          continue;
        }
        const assoc = await assocToCompanies(hs, a.object, items.map((x) => x.id));
        for (const x of items) {
          const acc = accountByCompany.get(assoc.get(x.id) ?? "");
          if (!acc || !x.properties.hs_timestamp) continue;
          const summary = a.summary(x.properties) ?? "";
          const linked = await db.query(
            `update activities set hubspot_id = $1, summary = $4
             where id = (select id from activities where account_id = $2 and hubspot_id is null and (
                           (kind = $3 and summary = replace($4, '[DEMO] ', ''))
                           -- demo emails are stored in HubSpot as notes "Email: ..." when the email scope is missing
                           or ($3 = 'note' and kind = 'email' and summary = replace($4, '[DEMO] Email: ', ''))) limit 1) returning id`,
            [x.id, acc, a.kind, summary]);
          if (!linked.rows.length) {
            await db.query(
              `insert into activities (account_id, kind, direction, occurred_at, summary, hubspot_id, source) values ($1,$2,$3,$4,$5,$6,'hubspot')
               on conflict (hubspot_id) do update set occurred_at = excluded.occurred_at, summary = excluded.summary`,
              [acc, a.kind, a.inbound(x.properties) ? "inbound" : "outbound", x.properties.hs_timestamp, summary, x.id]);
          }
          counts.activities++;
        }
      }
    } catch (e) {
      errors.push(`activities: ${(e as Error).message}`);
    }

    // 4. Push system columns back to sm_ company properties. Arjun's notes are never pushed.
    const sys = (await db.query<{ hubspot_company_id: string; score: number | null; band: string | null; lane: string | null; top_signal_summary: string | null; top_signal_url: string | null; last_signal_at: string | null; history: string | null }>(
      `select a.hubspot_company_id, a.score, a.band, a.lane, a.top_signal_summary, a.top_signal_url, a.last_signal_at,
              (select string_agg(line, E'\n') from (
                 select to_char(coalesce(s.published_at, s.fetched_at), 'DD Mon YYYY') || ': ' || coalesce(s.extraction->>'one_line_summary', s.title)
                        || ' (' || s.publisher || case when s.gate_result = 'history' then ', context' else '' end || ')' as line
                 from signals s where s.account_id = a.id and s.gate_result in ('accepted','history')
                 order by coalesce(s.published_at, s.fetched_at) desc limit 5) h) as history
       from accounts a where a.hubspot_company_id is not null`)).rows;
    const now = (opts.now ?? new Date()).toISOString();
    for (let i = 0; i < sys.length; i += 100) {
      await hs.req("POST", "/crm/v3/objects/companies/batch/update", {
        inputs: sys.slice(i, i + 100).map((s) => ({
          id: s.hubspot_company_id,
          properties: {
            sm_score: s.score ?? "", sm_band: s.band ?? "", sm_lane: s.lane ?? "",
            sm_top_signal: (s.top_signal_summary ?? "").slice(0, 250), sm_top_signal_url: s.top_signal_url ?? "",
            sm_last_signal_at: s.last_signal_at ? new Date(s.last_signal_at).toISOString() : "", sm_updated_at: now,
            sm_signal_history: s.history ?? "No verified signals in the last 90 days.",
          },
        })),
      });
      counts.pushed += Math.min(100, sys.length - i);
    }

    // 5. Churn-risk workflow in code: one retention task per event_key (idempotent).
    counts.retention_tasks = await createRetentionTasks(db, hs, owner);

    return { status: errors.length ? "partial" : "synced", path: pipe.path, note: pipe.note, counts, error: errors.join("; ") || undefined };
  } catch (e) {
    const scope = e instanceof HubspotError && e.isScope;
    return {
      status: "failed",
      error: (e as Error).message.slice(0, 500),
      counts,
      scopesHint: scope ? `Add these scopes to the private app: ${SCOPES_NEEDED.join(", ")}` : undefined,
    };
  }
}

export async function createRetentionTasks(db: Db, hs: Hs, owner: string) {
  const risky = (await db.query<{ id: string; hubspot_company_id: string; name: string }>(
    "select id, hubspot_company_id, name from accounts where lane = 'churn_risk' and hubspot_company_id is not null")).rows;
  let n = 0;
  for (const a of risky) {
    const ev = (await db.query<{ event_key: string; summary: string | null }>(
      "select event_key, summary from events where account_id = $1 order by points desc limit 1", [a.id])).rows[0];
    if (!ev) continue;
    const exists = await db.query("select 1 from tasks where event_key = $1", [ev.event_key]);
    if (exists.rows.length) continue;
    const due = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const t = await hs.req<{ id: string }>("POST", "/crm/v3/objects/tasks", {
      properties: {
        hs_task_subject: RETENTION_TASK, hs_task_body: `${a.name}: ${ev.summary ?? "signal detected"}. Created by Signal Monitor.`,
        hs_task_status: "NOT_STARTED", hs_task_priority: "HIGH", hs_timestamp: due, hubspot_owner_id: owner,
      },
    });
    await associate(hs, "tasks", t.id, a.hubspot_company_id);
    await db.query(
      "insert into tasks (account_id, title, kind, due_at, done, hubspot_id, source, event_key) values ($1,$2,'retention',$3,false,$4,'hubspot',$5) on conflict do nothing",
      [a.id, RETENTION_TASK, due, t.id, ev.event_key]);
    n++;
  }
  return n;
}

/** Dashboard checkbox writes completion back to HubSpot. */
export async function completeHubspotTask(hubspotId: string, done: boolean, opts: { hs?: Hs } = {}): Promise<void> {
  const hs = hubspotFrom(opts);
  if (!hs) throw new Error("HubSpot not connected");
  await hs.req("PATCH", `/crm/v3/objects/tasks/${hubspotId}`, { properties: { hs_task_status: done ? "COMPLETED" : "NOT_STARTED" } });
}
