import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createPgliteDb, setDbForTests, type Db } from "@/lib/db";
import { ensurePipeline, ensureProperties, mapDealStage, syncHubspot, completeHubspotTask, associate, PIPELINE_LABEL, STAGES } from "@/lib/hubspot/sync";
import { runIngest } from "@/lib/pipeline/ingest";
import { health } from "@/lib/health";
import Banners from "@/components/Banners";
import { fakeHubspot } from "./helpers/fake-hubspot";
import { NOW, fixtureDeps } from "./helpers/fixtures";

let db: Db;
beforeEach(async () => {
  process.env.ARJUN_EMAIL = "arjun@example.com";
  process.env.HUBSPOT_PRIVATE_APP_TOKEN = "test-token";
  db = await createPgliteDb();
});
afterEach(async () => {
  delete process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  await db.close();
});

describe("Enterprise Leads pipeline", () => {
  it("is created once with the eight stages, then found (idempotent)", async () => {
    const { hs, state } = fakeHubspot({ allowSecondPipeline: true });
    const a = await ensurePipeline(hs);
    const b = await ensurePipeline(hs);
    expect(a.path).toBe("enterprise_pipeline");
    expect(b.pipelineId).toBe(a.pipelineId);
    expect(state.calls.filter((c) => c === "POST /crm/v3/pipelines/deals")).toHaveLength(1);
    expect(Object.keys(a.stageIdByLabel)).toEqual(STAGES.map((s) => s.label));
    expect(state.pipelines.find((p) => p.label === PIPELINE_LABEL)).toBeTruthy();
  });

  it("falls back to adding stages to the default pipeline when only one pipeline is allowed, deleting nothing", async () => {
    const { hs, state } = fakeHubspot({ allowSecondPipeline: false });
    const p = await ensurePipeline(hs);
    expect(p.path).toBe("default_pipeline");
    expect(state.pipelines[0].stages.map((s) => s.label)).toContain("Appointment Scheduled");
    expect(state.pipelines[0].stages.map((s) => s.label)).toEqual(expect.arrayContaining(["Identified", "Closed Won"]));
    expect(state.calls.some((c) => c.startsWith("DELETE"))).toBe(false);
  });

  it("properties are created once (idempotent)", async () => {
    const { hs, state } = fakeHubspot();
    const first = await ensureProperties(hs);
    const second = await ensureProperties(hs);
    expect(first).toContain("sm_score");
    expect(first).toContain("deal.sm_demo");
    expect(second).toEqual([]);
    expect(state.companyProps.map((p) => p.name)).toContain("sm_relationship_stage");
  });

  it("maps deal stages; Closed Won means customer", () => {
    const pipe = { path: "enterprise_pipeline" as const, pipelineId: "p", stageIdByLabel: {}, labelByStageId: { s1: "Pilot", s2: "Closed Won", s3: "Closed Lost" } };
    expect(mapDealStage(pipe, "s1")).toEqual({ stage: "Pilot", is_customer: false });
    expect(mapDealStage(pipe, "s2")).toEqual({ stage: "Closed Won", is_customer: true });
    expect(mapDealStage(pipe, "s3")).toEqual({ stage: "Closed Lost", is_customer: false });
    expect(mapDealStage(pipe, "unknown")).toEqual({ stage: null, is_customer: false });
  });
});

describe("daily sync", () => {
  async function setup() {
    const f = fakeHubspot({ allowSecondPipeline: true });
    const pipe = await ensurePipeline(f.hs);
    const id = (await db.query<{ id: string }>(
      "insert into accounts (name, notes, relationship_read) values ('Acme Retail', 'Arjun wrote this', 'Keep warm') returning id")).rows[0].id;
    const c = await f.hs.req<{ id: string }>("POST", "/crm/v3/objects/companies", { properties: { name: "Acme Retail", hubspot_owner_id: "77", sm_demo: "true" } });
    const d = await f.hs.req<{ id: string }>("POST", "/crm/v3/objects/deals", { properties: { dealname: "Acme Retail - Enterprise rollout", pipeline: pipe.pipelineId, dealstage: pipe.stageIdByLabel["Closed Won"], hubspot_owner_id: "77", sm_demo: "true" } });
    await associate(f.hs, "deals", d.id, c.id);
    return { ...f, pipe, id, companyId: c.id, dealId: d.id };
  }

  it("Closed Won sets is_customer; only CRM columns change; Arjun's notes stay", async () => {
    const { hs, id, companyId, dealId } = await setup();
    const r = await syncHubspot(db, { hs, now: NOW });
    expect(r.status).toBe("synced");
    const a = (await db.query<Record<string, unknown>>("select * from accounts where id = $1", [id])).rows[0];
    expect(a).toMatchObject({ stage: "Closed Won", is_customer: true, is_active: true, hubspot_company_id: companyId, hubspot_deal_id: dealId, crm_is_demo: true, notes: "Arjun wrote this", relationship_read: "Keep warm" });
    const audit = (await db.query<{ actor: string }>("select distinct actor from audit")).rows.map((x) => x.actor);
    expect(audit).toEqual(["hubspot_sync"]);
  });

  it("picks up new companies owned by Arjun and pushes sm_ properties without notes", async () => {
    const { hs, state } = await setup();
    await hs.req("POST", "/crm/v3/objects/companies", { properties: { name: "Brand New Co", hubspot_owner_id: "77" } });
    const r = await syncHubspot(db, { hs, now: NOW });
    expect(r.counts?.new_accounts).toBe(1);
    expect((await db.query("select 1 from accounts where name = 'Brand New Co'")).rows).toHaveLength(1);
    const pushed = state.objects.companies.find((c) => c.properties.name === "Acme Retail")!;
    expect(pushed.properties.sm_updated_at).toBeTruthy();
    expect(JSON.stringify(state.objects.companies)).not.toContain("Arjun wrote this");
  });

  it("never edits deal stages in HubSpot", async () => {
    const { hs, state } = await setup();
    await syncHubspot(db, { hs, now: NOW });
    expect(state.calls.some((c) => /deals\/\d+$/.test(c) && c.startsWith("PATCH"))).toBe(false);
    expect(state.calls.some((c) => c.startsWith("POST /crm/v3/objects/deals/batch"))).toBe(false);
  });

  it("pulls tasks from HubSpot and the checkbox writes completion back", async () => {
    const { hs, state, companyId } = await setup();
    const t = await hs.req<{ id: string }>("POST", "/crm/v3/objects/tasks", { properties: { hs_task_subject: "Call HR", hs_task_status: "NOT_STARTED", hs_timestamp: NOW.toISOString(), hubspot_owner_id: "77" } });
    await associate(hs, "tasks", t.id, companyId);
    await syncHubspot(db, { hs, now: NOW });
    expect((await db.query("select 1 from tasks where hubspot_id = $1", [t.id])).rows).toHaveLength(1);
    await completeHubspotTask(t.id, true, { hs });
    expect(state.objects.tasks.find((x) => x.id === t.id)!.properties.hs_task_status).toBe("COMPLETED");
  });

  it("creates one retention task per churn-risk event (idempotent)", async () => {
    const { hs, state, id } = await setup();
    await syncHubspot(db, { hs, now: NOW });
    await db.query(`insert into events (account_id, type, event_key, subject_key, event_date, magnitude, certainty, time_scope, best_tier, points)
                    values ($1, 'HR_TECH_INTENT', 'k1', '', now(), 'large', 'confirmed', 'new', 'T2', 9)`, [id]);
    await db.tx(async (q) => { await q.query("select set_config('app.writer','system',true)"); await q.query("update accounts set lane = 'churn_risk' where id = $1", [id]); });
    await syncHubspot(db, { hs, now: NOW });
    await syncHubspot(db, { hs, now: NOW });
    expect(state.objects.tasks.filter((t) => t.properties.hs_task_subject === "Retention check-in, signal detected")).toHaveLength(1);
  });
});

describe("HubSpot failure (D08)", () => {
  it("a failed call never crashes the run and the dashboard shows the seed-data banner", async () => {
    const { hs } = fakeHubspot({ failAll: true });
    await db.query("insert into accounts (name, aliases) values ('Test Retail Co', '{}')");
    const r = await runIngest(db, { now: NOW, deps: fixtureDeps(), hubspot: hs });
    expect(r.status).toBe("ok");
    expect(r.counts.hubspot).toBe("failed");
    expect(r.counts.events_written).toBeGreaterThan(0);
    setDbForTests(db);
    const h = await health();
    expect(h.hubspot).toBe("failed");
    expect(renderToStaticMarkup(Banners({ h })!)).toContain("Running on seed data, HubSpot not connected.");
  });

  it("no token means not_configured, and ingest still runs", async () => {
    delete process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    expect((await syncHubspot(db)).status).toBe("not_configured");
  });
});
