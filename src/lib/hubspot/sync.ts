import type { Db } from "../db";

// Placeholder until the HubSpot module lands (Phase 2). D08: a missing token never stops the app.
export async function syncHubspot(_db: Db): Promise<{ status: string }> {
  if (!process.env.HUBSPOT_PRIVATE_APP_TOKEN) return { status: "not_configured" };
  return { status: "skipped" };
}

export async function completeHubspotTask(_hubspotId: string, _done: boolean): Promise<void> {
  if (!process.env.HUBSPOT_PRIVATE_APP_TOKEN) throw new Error("HubSpot not connected");
}
