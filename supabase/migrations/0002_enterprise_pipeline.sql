-- Addendum: HubSpot "Enterprise Leads" deal pipeline. accounts.stage mirrors the deal stage (CRM-owned, read-only in the UI).
alter table accounts add column if not exists hubspot_deal_id text;
alter table accounts drop constraint if exists accounts_stage_check;
alter table accounts add constraint accounts_stage_check
  check (stage in ('Identified','Outreach','Discovery','Qualified','Pilot','Negotiation','Closed Won','Closed Lost'));

create or replace function sm_writer_cols(w text) returns text[] language sql immutable as $$
  select case w
    when 'system' then array['name','domain','aliases','sector','hq_city','employee_count','employee_count_source_url',
      'employee_count_as_of','employee_count_is_estimate','employee_count_note','frontline_share','multi_site',
      'india_footprint','newsroom_url','newsroom_rss',
      'score','band','confidence','lane','flags','top_signal_summary','top_signal_url','last_signal_at',
      'score_breakdown','system_draft','draft_tone','scored_at']
    when 'crm' then array['is_active','hubspot_company_id','hubspot_deal_id','stage','is_customer','renewal_date','owner_email','crm_is_demo']
    when 'user' then array['notes','last_contacted_at','relationship_read','my_draft','snoozed_until','draft_accepted_at','notes_is_demo']
    else array[]::text[] end
$$;
