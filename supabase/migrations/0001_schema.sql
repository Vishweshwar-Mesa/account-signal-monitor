-- B2B Account Signal Monitor schema. All timestamps UTC; the UI shows IST.

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  -- profile (system-owned, from cited research or CRM import)
  name text not null,
  domain text,
  aliases text[] not null default '{}',
  sector text,
  hq_city text,
  employee_count int,
  employee_count_source_url text,
  employee_count_as_of date,
  employee_count_is_estimate boolean not null default false,
  employee_count_note text,
  frontline_share text check (frontline_share in ('low','medium','high')),
  multi_site boolean,
  india_footprint boolean not null default true,
  newsroom_url text,
  newsroom_rss text,
  -- CRM-owned (written only by the HubSpot sync or the demo CRM seed)
  is_active boolean not null default false,
  hubspot_company_id text,
  stage text check (stage in ('Outreach','Qualified','Pilot','Customer')),
  is_customer boolean not null default false,
  renewal_date date,
  owner_email text,
  crm_is_demo boolean not null default false,
  -- ARJUN-owned (never written by the system)
  notes text,
  last_contacted_at timestamptz,
  relationship_read text,
  my_draft text,
  snoozed_until timestamptz,
  draft_accepted_at timestamptz,
  notes_is_demo boolean not null default false,
  -- SYSTEM-owned (scores and drafts, recomputed every run)
  score int check (score between 1 and 10),
  band text check (band in ('hot','warm','cold')),
  confidence text check (confidence in ('high','medium','low')),
  lane text check (lane in ('outreach','churn_risk','expansion','re_engage')),
  flags text[] not null default '{}',
  top_signal_summary text,
  top_signal_url text,
  last_signal_at timestamptz,
  score_breakdown jsonb,
  system_draft text,
  draft_tone text check (draft_tone in ('warm','brief','curious')),
  scored_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists accounts_name_key on accounts (lower(name));

create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  url text not null unique,
  url_hash text not null,
  publisher text,
  tier text check (tier in ('T1','T2','CONTEXT')),
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  title text,
  evidence_quote text,
  extraction jsonb,
  gate_result text not null,
  rejected_reason text,
  is_seed boolean not null default false
);
create index if not exists signals_account_idx on signals (account_id, published_at desc);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  type text not null,
  event_key text not null unique,
  subject_key text not null,
  summary text,
  first_seen_at timestamptz not null default now(),
  event_date timestamptz not null,
  magnitude text not null,
  certainty text not null,
  time_scope text not null,
  source_count int not null default 1,
  source_domains text[] not null default '{}',
  best_tier text not null,
  competitor text,
  points numeric not null default 0,
  evidence_signal_ids uuid[] not null default '{}'
);
create index if not exists events_account_idx on events (account_id, event_date desc);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  title text not null,
  why text,
  source_url text not null,
  as_of date not null,
  role_group text check (role_group in ('hr_head','ops_head','payroll_lead')),
  removed_at timestamptz
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  kind text not null default 'task' check (kind in ('task','pilot_checkpoint','retention')),
  due_at timestamptz,
  done boolean not null default false,
  hubspot_id text unique,
  source text not null default 'demo',
  event_key text unique
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  kind text not null check (kind in ('call','email','meeting','note')),
  direction text not null default 'outbound' check (direction in ('inbound','outbound')),
  occurred_at timestamptz not null,
  summary text,
  hubspot_id text unique,
  source text not null default 'demo'
);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in ('ingest','morning')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','partial','failed')),
  counts jsonb not null default '{}',
  error text
);

create table if not exists sends (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('hotlist','brief','alert')),
  send_key text not null unique,
  sent_at timestamptz not null default now(),
  window_start timestamptz,
  window_end timestamptz,
  recipient text not null,
  account_ids uuid[] not null default '{}',
  status text not null default 'pending'
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references signals(id) on delete cascade,
  verdict text not null check (verdict in ('useful','wrong')),
  created_at timestamptz not null default now()
);

create table if not exists audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text not null check (actor in ('system','arjun','hubspot_sync')),
  account_id uuid,
  columns text[] not null,
  old jsonb,
  new jsonb
);

create table if not exists fetch_cache (
  url_hash text primary key,
  url text not null,
  status text not null,
  fetched_at timestamptz not null default now()
);

-- D02: column ownership. Keep in sync with src/lib/cols.ts (a test checks this).
create or replace function sm_writer_cols(w text) returns text[] language sql immutable as $$
  select case w
    when 'system' then array['name','domain','aliases','sector','hq_city','employee_count','employee_count_source_url',
      'employee_count_as_of','employee_count_is_estimate','employee_count_note','frontline_share','multi_site',
      'india_footprint','newsroom_url','newsroom_rss',
      'score','band','confidence','lane','flags','top_signal_summary','top_signal_url','last_signal_at',
      'score_breakdown','system_draft','draft_tone','scored_at']
    when 'crm' then array['is_active','hubspot_company_id','stage','is_customer','renewal_date','owner_email','crm_is_demo']
    when 'user' then array['notes','last_contacted_at','relationship_read','my_draft','snoozed_until','draft_accepted_at','notes_is_demo']
    else array[]::text[] end
$$;

-- BEFORE UPDATE guard: the writer is read from the transaction setting app.writer.
-- A signed-in client (role authenticated) is treated as the 'user' writer. Anything else with no writer is rejected.
create or replace function sm_guard_accounts() returns trigger language plpgsql as $$
declare
  w text := nullif(current_setting('app.writer', true), '');
  allowed text[];
  k text;
  o jsonb := to_jsonb(OLD);
  n jsonb := to_jsonb(NEW);
  bad text[] := '{}';
begin
  if w is null and current_user = 'authenticated' then w := 'user'; end if;
  if w is null then
    raise exception 'accounts update rejected: no writer set (app.writer)';
  end if;
  allowed := sm_writer_cols(w);
  if cardinality(allowed) = 0 then
    raise exception 'accounts update rejected: unknown writer %', w;
  end if;
  for k in select jsonb_object_keys(n) loop
    if (o -> k) is distinct from (n -> k) and not (k = any(allowed)) then
      bad := bad || k;
    end if;
  end loop;
  if cardinality(bad) > 0 then
    raise exception 'accounts update rejected: writer % may not change %', w, array_to_string(bad, ', ');
  end if;
  return NEW;
end $$;

drop trigger if exists accounts_guard on accounts;
create trigger accounts_guard before update on accounts for each row execute function sm_guard_accounts();

-- Row level security: on for every table. Signed-in users read everything.
do $$
declare t text;
begin
  foreach t in array array['accounts','signals','events','people','tasks','activities','runs','sends','feedback','audit','fetch_cache'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_read', t);
    execute format('revoke all on %I from anon', t);
    execute format('revoke insert, update, delete on %I from authenticated', t);
  end loop;
end $$;

-- Client-side writes: only Arjun-owned columns, tasks.done, feedback, and hiding a person.
grant update (notes, last_contacted_at, relationship_read, my_draft, snoozed_until, draft_accepted_at) on accounts to authenticated;
drop policy if exists accounts_user_update on accounts;
create policy accounts_user_update on accounts for update to authenticated using (true) with check (true);
grant update (done) on tasks to authenticated;
drop policy if exists tasks_user_update on tasks;
create policy tasks_user_update on tasks for update to authenticated using (true) with check (true);
grant update (removed_at) on people to authenticated;
drop policy if exists people_user_update on people;
create policy people_user_update on people for update to authenticated using (true) with check (true);
grant insert on feedback to authenticated;
drop policy if exists feedback_user_insert on feedback;
create policy feedback_user_insert on feedback for insert to authenticated with check (true);
