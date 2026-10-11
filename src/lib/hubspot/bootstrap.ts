import type { Db } from "../db";
import type { Hs } from "./client";
import { ensureProperties, ensurePipeline, ownerIdFor, associate, syncHubspot, assocToCompanies } from "./sync";

// One-time, idempotent setup of DEMO records in HubSpot for the active accounts:
// company (sm_demo), one deal "{Company} - Enterprise rollout" in Enterprise Leads, and the demo tasks and activities.
// Existing HubSpot records are never deleted or edited, apart from adding missing stages to a pipeline.

const ACT: Record<string, { object: string; props: (x: { summary: string; at: string; inbound: boolean }) => Record<string, string> }> = {
  call: { object: "calls", props: (x) => ({ hs_call_title: `[DEMO] ${x.summary}`, hs_call_body: "Demo record created by Signal Monitor.", hs_call_direction: x.inbound ? "INBOUND" : "OUTBOUND", hs_call_status: "COMPLETED" }) },
  email: { object: "emails", props: (x) => ({ hs_email_subject: `[DEMO] ${x.summary}`, hs_email_text: "Demo record created by Signal Monitor.", hs_email_direction: x.inbound ? "INCOMING_EMAIL" : "EMAIL", hs_email_status: "SENT" }) },
  meeting: { object: "meetings", props: (x) => ({ hs_meeting_title: `[DEMO] ${x.summary}`, hs_meeting_body: "Demo record created by Signal Monitor.", hs_meeting_start_time: x.at, hs_meeting_end_time: new Date(new Date(x.at).getTime() + 3600_000).toISOString(), hs_meeting_outcome: "SCHEDULED" }) },
  note: { object: "notes", props: (x) => ({ hs_note_body: `[DEMO] ${x.summary}` }) },
};

/** Search by filters and return the first match that is associated with this company. */
async function findForCompany(hs: Hs, object: string, filters: { propertyName: string; operator: string; value: string }[], companyId: string) {
  const r = await hs.req<{ results: { id: string }[] }>("POST", `/crm/v3/objects/${object}/search`, { filterGroups: [{ filters }], limit: 50 });
  if (!r.results.length) return null;
  const assoc = await assocToCompanies(hs, object, r.results.map((x) => x.id));
  return r.results.find((x) => assoc.get(x.id) === companyId)?.id ?? null;
}

const TITLE_PROP: Record<string, string> = { calls: "hs_call_title", emails: "hs_email_subject", meetings: "hs_meeting_title", notes: "hs_note_body" };

/** Idempotent: search by title first. If an email cannot be associated (scope), it is removed and logged as a note instead. */
async function createActivity(hs: Hs, kind: string, x: { summary: string; at: string; inbound: boolean }, owner: string, companyId: string, log: (s: string) => void): Promise<string | null> {
  const spec = ACT[kind];
  const props = spec.props(x);
  const titleProp = TITLE_PROP[spec.object];
  try {
    const found = await findForCompany(hs, spec.object, [{ propertyName: titleProp, operator: "EQ", value: props[titleProp] }, { propertyName: "hubspot_owner_id", operator: "EQ", value: owner }], companyId);
    if (found) return found;
  } catch {
    /* search not available for this object; create */
  }
  const r = await hs.req<{ id: string }>("POST", `/crm/v3/objects/${spec.object}`, { properties: { hs_timestamp: x.at, hubspot_owner_id: owner, ...props } });
  try {
    await associate(hs, spec.object, r.id, companyId);
    return r.id;
  } catch (e) {
    await hs.req("DELETE", `/crm/v3/objects/${spec.object}/${r.id}`).catch(() => {});
    if (kind === "note") throw e;
    log(`${spec.object} association refused (${(e as Error).message.slice(0, 80)}); logged as a note instead`);
    return createActivity(hs, "note", { ...x, summary: `${kind === "email" ? "Email" : kind}: ${x.summary}` }, owner, companyId, log);
  }
}

export async function bootstrapHubspot(db: Db, hs: Hs, log: (s: string) => void = console.log) {
  const email = process.env.ARJUN_EMAIL ?? "";
  const owner = await ownerIdFor(hs, email);
  log(`owner ${owner}`);
  log(`properties created: ${(await ensureProperties(hs)).join(", ") || "none, already present"}`);
  const pipe = await ensurePipeline(hs);
  log(`pipeline path: ${pipe.path}${pipe.note ? ` (${pipe.note})` : ""}`);

  const accounts = (await db.query<{ id: string; name: string; domain: string | null; stage: string | null; is_customer: boolean }>(
    "select id, name, domain, stage, is_customer from accounts where is_active order by name")).rows;
  for (const a of accounts) {
    const found = await hs.req<{ results: { id: string }[] }>("POST", "/crm/v3/objects/companies/search", {
      filterGroups: [{ filters: [{ propertyName: "name", operator: "EQ", value: a.name }] }], properties: ["name"], limit: 1 });
    let companyId = found.results[0]?.id;
    if (!companyId) {
      const c = await hs.req<{ id: string }>("POST", "/crm/v3/objects/companies", { properties: {
        name: a.name, ...(a.domain ? { domain: a.domain } : {}), hubspot_owner_id: owner, sm_demo: "true",
        lifecyclestage: a.is_customer ? "customer" : "opportunity", ...(pipe.path === "company_property" && a.stage ? { sm_relationship_stage: a.stage } : {}),
      } });
      companyId = c.id;
      log(`company created: ${a.name}`);
    }
    if (pipe.pipelineId && a.stage) {
      const dealname = `${a.name} - Enterprise rollout`;
      const d = await hs.req<{ results: { id: string }[] }>("POST", "/crm/v3/objects/deals/search", {
        filterGroups: [{ filters: [{ propertyName: "dealname", operator: "EQ", value: dealname }] }], properties: ["dealname"], limit: 1 });
      if (!d.results[0]) {
        const deal = await hs.req<{ id: string }>("POST", "/crm/v3/objects/deals", { properties: {
          dealname, pipeline: pipe.pipelineId, dealstage: pipe.stageIdByLabel[a.stage], hubspot_owner_id: owner, sm_demo: "true",
        } });
        await associate(hs, "deals", deal.id, companyId);
        log(`deal created: ${dealname} at ${a.stage}`);
      }
    }
    const tasks = (await db.query<{ id: string; title: string; due_at: string; done: boolean }>(
      "select id, title, due_at, done from tasks where account_id = $1 and hubspot_id is null and source = 'demo'", [a.id])).rows;
    for (const t of tasks) {
      let hid = await findForCompany(hs, "tasks", [{ propertyName: "hs_task_subject", operator: "EQ", value: `[DEMO] ${t.title}` }, { propertyName: "hubspot_owner_id", operator: "EQ", value: owner }], companyId);
      if (!hid) {
        const r = await hs.req<{ id: string }>("POST", "/crm/v3/objects/tasks", { properties: {
          hs_task_subject: `[DEMO] ${t.title}`, hs_task_status: t.done ? "COMPLETED" : "NOT_STARTED", hs_task_priority: "MEDIUM",
          hs_timestamp: new Date(t.due_at).toISOString(), hubspot_owner_id: owner,
        } });
        await associate(hs, "tasks", r.id, companyId);
        hid = r.id;
      }
      await db.query("update tasks set hubspot_id = $2, title = $3 where id = $1", [t.id, hid, `[DEMO] ${t.title}`]);
    }
    const acts = (await db.query<{ id: string; kind: string; direction: string; occurred_at: string; summary: string }>(
      "select id, kind, direction, occurred_at, summary from activities where account_id = $1 and hubspot_id is null and source = 'demo'", [a.id])).rows;
    for (const x of acts) {
      const at = new Date(x.occurred_at).toISOString();
      const inbound = x.direction === "inbound";
      const hid = await createActivity(hs, x.kind, { summary: x.summary, at, inbound }, owner, companyId, log);
      if (hid) await db.query("update activities set hubspot_id = $2, summary = $3 where id = $1", [x.id, hid, `[DEMO] ${x.summary}`]);
    }
    log(`linked ${tasks.length} tasks and ${acts.length} activities for ${a.name}`);
  }

  // Try the churn-risk workflow through the automation API. Usually needs a paid plan or extra scope.
  let workflow = "code";
  try {
    await hs.req("GET", "/automation/v4/flows?limit=1");
    workflow = "api_available_not_created";
  } catch (e) {
    workflow = `code (automation API refused: ${(e as Error).message.slice(0, 160)})`;
  }
  log(`churn-risk workflow path: ${workflow}`);
  const sync = await syncHubspot(db, { hs });
  log(`sync: ${sync.status} ${JSON.stringify(sync.counts)} ${sync.error ?? ""}`);
  return { pipeline: pipe.path, workflow, sync };
}
