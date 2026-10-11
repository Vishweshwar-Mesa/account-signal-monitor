// D02: three column-owner groups on the accounts table.
// Keep in sync with sm_writer_cols() in supabase/migrations/0001_schema.sql (tests/cols.test.ts checks this).

export const ARJUN_COLS = [
  "notes",
  "last_contacted_at",
  "relationship_read",
  "my_draft",
  "snoozed_until",
  "draft_accepted_at",
  "notes_is_demo",
] as const;

export const CRM_COLS = [
  "is_active",
  "hubspot_company_id",
  "stage",
  "is_customer",
  "renewal_date",
  "owner_email",
  "crm_is_demo",
] as const;

export const SYSTEM_COLS = [
  // profile, from cited research
  "name",
  "domain",
  "aliases",
  "sector",
  "hq_city",
  "employee_count",
  "employee_count_source_url",
  "employee_count_as_of",
  "employee_count_is_estimate",
  "employee_count_note",
  "frontline_share",
  "multi_site",
  "india_footprint",
  "newsroom_url",
  "newsroom_rss",
  // scores and drafts, recomputed every run
  "score",
  "band",
  "confidence",
  "lane",
  "flags",
  "top_signal_summary",
  "top_signal_url",
  "last_signal_at",
  "score_breakdown",
  "system_draft",
  "draft_tone",
  "scored_at",
] as const;

export type ArjunCol = (typeof ARJUN_COLS)[number];
export type CrmCol = (typeof CRM_COLS)[number];
export type SystemCol = (typeof SYSTEM_COLS)[number];
export type Writer = "system" | "crm" | "user";
