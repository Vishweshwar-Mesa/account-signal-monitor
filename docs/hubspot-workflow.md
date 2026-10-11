# HubSpot: pipeline, sync and the churn-risk workflow

## Which path was used
- **Deal pipeline:** a real "Enterprise Leads" deals pipeline was created through the API (path `enterprise_pipeline`). Stages: Identified 10%, Outreach 20%, Discovery 35%, Qualified 50%, Pilot 65%, Negotiation 80%, Closed Won, Closed Lost. If a plan ever refuses a second pipeline, the code adds the missing stages to the default pipeline (deleting nothing). If that also fails, it falls back to the `sm_relationship_stage` company property. Tested in tests/hubspot.test.ts.
- **Churn-risk workflow: done in code.** The automation API returned 403 (missing scope; workflows also usually need a paid plan). The daily sync creates the task instead. See below.

## Demo records (all flagged)
- 10 companies with `sm_demo = true`, owned by Arjun's HubSpot user.
- 10 deals named "{Company} - Enterprise rollout" in Enterprise Leads, `sm_demo = true`. Stages run from Identified to Pilot. Updater Services and Krsnaa Diagnostics are at Closed Won as customers being expanded.
- Tasks and activities are titled "[DEMO] ...". Demo emails could not be associated (the token lacks the email scope), so they are logged as notes that start "Email:".
- Created by `scripts/hubspot-bootstrap.mts`, which is idempotent (it searches before it creates).

## What the daily sync does (inside the ingest job)
1. Finds Arjun's owner id by ARJUN_EMAIL.
2. Reads companies owned by Arjun, and deals in the pipeline owned by Arjun with their company associations.
3. For each company: finds or creates the account (new companies are picked up automatically), then writes only CRM-owned columns: `hubspot_company_id`, `hubspot_deal_id`, `stage` (from the deal stage), `is_customer` (true when Closed Won), `is_active`, `owner_email`, `renewal_date`, `crm_is_demo`. All of it goes through `updateAccountCrmColumns`, audited as `hubspot_sync`.
4. Pulls tasks and calls, meetings and notes associated with those companies into Supabase (upsert by `hubspot_id`), so changes made in HubSpot reach the dashboard.
5. Pushes system columns to company properties: `sm_score`, `sm_band`, `sm_lane`, `sm_top_signal`, `sm_top_signal_url`, `sm_last_signal_at`, `sm_updated_at`. Arjun's notes are never pushed.
6. Creates the churn-risk task (below).

The system never edits deal stages in HubSpot. Ticking a task in the dashboard sets `hs_task_status` on that HubSpot task.

## Churn-risk workflow, as implemented in code
- Trigger: an account whose lane is `churn_risk` (a customer with a buying-type or risk signal).
- Action: create one HubSpot task "Retention check-in, signal detected" for the owner, associated with the company, due in 2 days, high priority.
- Idempotent: one task per `event_key`, stored in `tasks.event_key` (unique), so the same event never creates two tasks.

## Equivalent manual workflow (for a paid HubSpot plan)
1. Automation, Workflows, Create workflow, Company-based, Blank.
2. Enrollment trigger: company property `SM lane` is any of `churn_risk`. Re-enrollment on when SM lane changes.
3. Action: Create task. Title "Retention check-in, signal detected". Assign to the company owner. Due in 2 business days. Priority High. Associate with the enrolled company.
4. Turn on. Then turn off the in-code task creation by removing step 5 in `syncHubspot`, so tasks are not created twice.

## Scopes
Used: companies read and write, deals read and write, contacts read and write (tasks, notes, calls, meetings), owners read, company and deal schemas write.
Missing on the current token: `sales-email-read` (email search and association) and `automation` (workflows). Add them to the private app if you want emails linked and the workflow created through the API.
