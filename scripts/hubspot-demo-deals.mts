// Creates DEMO deals in HubSpot (Enterprise Leads) for accounts that have a demo stage in data/seed/demo-crm.json but no deal yet,
// and sets the company's lifecycle stage and sm_renewal_date. HubSpot stays the source of truth; the daily sync pulls these into accounts.
// Idempotent: searches by deal name first. Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/hubspot-demo-deals.mts
import { readFileSync } from "node:fs";
import { hubspotClient } from "../src/lib/hubspot/client";
import { ensurePipeline, ownerIdFor, associate } from "../src/lib/hubspot/sync";

const DAY = 86_400_000;
const hs = hubspotClient(process.env.HUBSPOT_PRIVATE_APP_TOKEN!);
const owner = await ownerIdFor(hs, process.env.ARJUN_EMAIL!);
const pipe = await ensurePipeline(hs);
const crm = JSON.parse(readFileSync("data/seed/demo-crm.json", "utf8")).accounts as Record<string, { stage: string; is_customer: boolean; renewal_in_days?: number }>;
for (const [name, c] of Object.entries(crm)) {
  const co = (await hs.req<{ results: { id: string }[] }>("POST", "/crm/v3/objects/companies/search", {
    filterGroups: [{ filters: [{ propertyName: "name", operator: "EQ", value: name }] }], limit: 1 })).results[0];
  if (!co) { console.log("no company in HubSpot:", name); continue; }
  const dealname = `${name} - Enterprise rollout`;
  const found = (await hs.req<{ results: { id: string }[] }>("POST", "/crm/v3/objects/deals/search", {
    filterGroups: [{ filters: [{ propertyName: "dealname", operator: "EQ", value: dealname }] }], limit: 1 })).results[0];
  if (found) {
    // Keep the demo renewal date in HubSpot (source of truth) when it is missing.
    if (c.renewal_in_days != null) {
      const cur = await hs.req<{ properties: { sm_renewal_date?: string | null } }>("GET", `/crm/v3/objects/companies/${co.id}?properties=sm_renewal_date`);
      if (!cur.properties.sm_renewal_date) {
        await hs.req("PATCH", `/crm/v3/objects/companies/${co.id}`, { properties: { sm_renewal_date: new Date(Date.now() + c.renewal_in_days * DAY).toISOString().slice(0, 10) } });
        console.log(`renewal set: ${name}`);
      }
    }
    continue;
  }
  const deal = await hs.req<{ id: string }>("POST", "/crm/v3/objects/deals", { properties: {
    dealname, pipeline: pipe.pipelineId!, dealstage: pipe.stageIdByLabel[c.stage], hubspot_owner_id: owner, sm_demo: "true",
    ...(c.stage === "Closed Won" ? { closedate: new Date(Date.now() - 240 * DAY).toISOString() } : {}),
  } });
  await associate(hs, "deals", deal.id, co.id);
  await hs.req("PATCH", `/crm/v3/objects/companies/${co.id}`, { properties: {
    lifecyclestage: c.is_customer ? "customer" : "opportunity", sm_demo: "true",
    ...(c.renewal_in_days != null ? { sm_renewal_date: new Date(Date.now() + c.renewal_in_days * DAY).toISOString().slice(0, 10) } : {}),
  } });
  console.log(`deal created: ${dealname} at ${c.stage}`);
}
