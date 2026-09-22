# CleanOps Data Mapping

Purpose: source-to-target map for implemented pages and server workflows. Exact behavior is owned by current code, migrations and tests.

Last reviewed: 2026-09-22, includes issue #48 (finance ledger edit/delete) on top of `main` at `9efa8d3`.

## Route summary

Roles per route come from `src/config/navigation.ts` and the page guards; RLS/RPCs remain the enforcement boundary.

| Route | Roles | Main implementation | Purpose |
|---|---|---|---|
| `/login` | anonymous | `src/app/login`, hosted-demo services | Supabase Auth with a named demo persona selector. |
| `/operations` | supervisor, area manager, operations manager, director | site-portfolio + operations Supabase integrations + actions | Portfolio of every accessible site; staffing, replacements, zones, review/correction/SLA risk for the walkthrough site. |
| `/mobile` | cleaner, director | operations integration + mobile actions | Cleaner task context and before/after photo capture. |
| `/review` | supervisor, area manager, operations manager, director | review Supabase integration + actions | Evidence pair, AI suggestion, findings, corrections, approval. |
| `/finance` | area manager (read only), director (read + write) | finance integration + actions | Site-scoped supplier/item setup, inventory and labour ledgers. The WhatsApp context queue is **not mounted** (see below). |
| `/incidents` | supervisor, area manager, operations manager, director | reporting integration + incident actions | Incident and equipment intake/correction. |
| `/reports` | client viewer, supervisor, area manager, operations manager, director | reporting integration + report actions | SLA snapshot preparation and release. |
| `/reports/client` | client viewer (and directors for inspection) | reporting integration | Released-only redacted client report. |

## /login

| UI/behavior | Source | Rule |
|---|---|---|
| Sign-in | Supabase Auth | Cookie-bound session. |
| Persona selector | `scripts/provision-demo-logins.mjs` | 17 named demo personas (2 directors, 2 area managers, 4 supervisors, 9 cleaners) provisioned with one shared rotated password; not in `supabase/seed.sql`. |
| Organization role | `memberships.role/state` | Active membership required. |
| Site access | `member_site_access` | Directors and operations managers see every org site; other roles only sites with an active grant (`starts_at <= now < ends_at`). |
| Supervisor/cleaner/client perspective | membership role + hosted capability | Page runtime checks capability before loading workflow data. |

## /operations

### Site portfolio (all accessible sites)

Source: `src/integrations/operations/supabase-site-portfolio.ts`, rendered by `SitePortfolio` above the command view. Every accessible site is listed, so accounts with no walkthrough site still see data.

| UI field | Source | Transformation |
|---|---|---|
| Site name, city | `sites.name`, `sites.city` | Direct, from the access context. |
| Zones | `site_zones` | Site scoped, ordered by name. |
| Active tasks | `service_tasks` | Count where `active`. |
| Task records | `task_runs` | Count of all runs per site. |
| Eligible workers | `worker_site_permissions` | Count where `state='active'` (not filtered by `valid_until`). |
| Equipment assets | `equipment_assets` + `equipment_models` | Asset code, category, manufacturer/model, status, condition, last/next service date. |
| Equipment issues | `equipment_reports` | Label and state, newest first. |

The interactive command view below is shown only when the account can manage operations and either is a director or has a grant to the fixed walkthrough site `DEMO_SITE_ID` (`src/services/operations-runtime.ts`).

### Command view reads

| UI field | Source | Transformation |
|---|---|---|
| Site name | `sites.name` | Direct. |
| Required positions | `get_shift_coverage_at` -> `shift_coverage_requirements` | Shift/time scoped. |
| Present workers | coverage RPC using `shift_assignments`, `attendance_events`, `worker_site_permissions` | Distinct eligible assigned check-ins. |
| Coverage gap | coverage RPC | required - present. |
| Coverage timeline | coverage RPC at demo timestamps | 22:45 / 23:05 / 23:10. |
| Zones | `site_zones` | Site scoped. |
| Task names | `service_tasks` | Joined in app to runs. |
| Task state/due | `task_runs` | Mapped by zone/task. |
| Replacement candidates | `workers` | Demo candidate filter; eligibility rechecked before write. |
| Selected replacements | `replacement_selections` | Human selection state. |
| Assigned workers | `shift_assignments` | Used to locate attendance. |
| Checked-in status | `attendance_events` | event_type=check_in. |
| Outstanding reviews | `task_runs` | state=submitted. |
| Open corrections | `corrective_actions` | state open/submitted. |
| SLA risks | `task_runs.state,due_at` | Unfinished/correction states before risk cutoff. |

### Writes

**Select replacement**
1. Validate active `worker_site_permissions`.
2. Insert/upsert `shift_assignments`.
3. Upsert `replacement_selections`.

**Check in**
1. Require shift assignment.
2. Prevent duplicate check-in.
3. Insert `attendance_events(event_type='check_in')`.
4. Coverage is recalculated from persisted attendance.

Selection never counts as attendance.

## /mobile

### Reads

| UI field | Source | Rule |
|---|---|---|
| Task occurrence/state | `task_runs` | Selected run. |
| Task name | `service_tasks.name` | By task ID. |
| Zone | `site_zones.name` | By zone ID. |
| Context selected | `conversation_contexts` | Demo thread/task context exists. |
| BEFORE ready | `task_evidence` | role=before + ready + linked. |
| AFTER ready | `task_evidence` | role=after + ready + linked. |

### Writes

**Select work area**
Writes `conversation_contexts` with account/thread/sender/assignment/site/zone/task/expiry. This does not write attendance.

**Prepare photo**
- validate JPEG/PNG/WebP metadata and size;
- require cleaner/site/task access and expected before/after role;
- create durable ingress -> `integration_webhook_events` + `processing_jobs`;
- normalize to `external_messages`;
- stage `task_evidence`;
- issue a single-path signed private Storage upload token.

**Finalize photo**
- verify signed application ticket and user;
- re-read staged `task_evidence` and source `external_messages`;
- download private object server-side;
- validate source, signature, MIME, size and SHA-256;
- finalize linkage;
- create/update `evidence_pairs` and revision when deterministic rules allow.

Real upload code is merged (CLEAN-011, PR #23; plan archived under `docs/plans/completed/`). Hosted rehearsal on a physical phone is still required by issue #26 before it is claimed for the demo.

## /review

### Reads

| UI field | Source |
|---|---|
| Task/revision/state/due | `task_runs` |
| Task name | `service_tasks` |
| Zone | `site_zones` |
| Current pair | `evidence_pairs` |
| AI/mock result | `quality_decisions` |
| Confirmed findings | `quality_findings` |
| Corrective actions | `corrective_actions` |
| Human inspections | `inspections` |
| Review history | `review_audit_events` |

### Writes / RPCs

| Action | Persistence |
|---|---|
| Run Mock AI | `record_quality_decision` -> `quality_decisions`, audit. |
| Simulate AI failure | Failed `quality_decisions` row, manual fallback remains. |
| Confirm suggestion | `confirm_quality_suggestion` -> finding, corrective action, inspection/audit, task-state effects defined by migration. |
| Dismiss suggestion | `dismiss_quality_suggestion` -> audit only; no finding. |
| Approve current revision | `approve_submission` -> inspection/audit/task effects after stale-revision checks. |
| Demo initial/correction submission | shared ingress/evidence path -> messages, evidence, pairs, revisions. |

AI score never directly approves work.

## /finance — supplier, inventory, labour

Access: Directors read and write everything below; Area Managers read the inventory ledger and the accepted-import reconciliation summary (§/finance accounting imports) for their granted casinos, but not the labour ledger or any import detail; every other role sees "Finance access restricted". A `siteId` query parameter (validated against the account's sites) selects the casino; the default is the first accessible site.

### Reads

| UI | Source |
|---|---|
| Supplier options | active `vendors` (organization scoped) |
| Inventory item options | active `inventory_items` (organization scoped) |
| Worker options | `workers` (organization scoped) |
| Task options | selected-site `task_runs` + `service_tasks` |
| Inventory ledger | selected-site `inventory_transactions` + item/vendor joins |
| Labour ledger (Director only) | selected-site `labor_cost_entries` + worker join |

The entry forms are rendered only for Directors (`editable`). RLS independently limits `inventory_transactions` reads to `private.can_view_site_finance`, `labor_cost_entries` reads to `private.can_administer_org` (Director only, since CLEAN-020) and both inserts to `private.can_edit_site_finance`.

Fixed (issue #55): `getFinanceWorkspace` now takes a `canReadLabour` flag and skips the `labor_cost_entries` query entirely when the caller cannot read it, returning `labourRestricted: true` instead of an empty array. `FinanceWorkspace` shows an explicit "restricted to Directors" message for the labour ledger in that case, distinct from the genuine "No labour cost entries have been recorded." empty state a Director still sees.

### Writes (Directors only)

| Action | Table | Key mapping |
|---|---|---|
| Add supplier | `vendors` | organization, name, code, contact reference |
| Add item | `inventory_items` | organization, SKU, name, category, unit, reorder level |
| Record stock movement | `inventory_transactions` | organization/site, vendor optional, item, type, quantity, unit cost, time, notes |
| Record labour | `labor_cost_entries` | organization/site, worker/task optional, date, hours, hourly cost, cost type, notes |
| Edit/delete inventory transaction | `inventory_transactions` | `update_inventory`/`delete_inventory` actions; scoped by `id` + `siteId` |
| Edit/delete labour entry | `labor_cost_entries` | `update_labour`/`delete_labour` actions; scoped by `id` + `siteId` |

`total_cost` is database-generated and cannot be written directly. Since issue #48 (migration `20260922034200`), a Director can also edit and delete rows on either ledger; every edit/delete is audited in `finance_ledger_audit_events` and a trigger blocks reassigning a row's `organization_id`, `site_id` or `id`.

Not implemented: revenue, cost import batches, source-document references and per-site profitability (issue #33). `source_message_id` exists on both ledgers but no UI sets it.

## /finance — WhatsApp context queue (currently unmounted)

**Status:** the database, RPC, integration (`src/integrations/messages/supabase-message-context.ts`), component (`src/components/message-context-queue.tsx`) and server action (`performMessageResolution` in `src/app/finance/actions.ts`) exist, but nothing renders `MessageContextQueue` or calls `getMessageWorkspace`. The role-scoped finance rework (PR #43) removed it from `/finance`, and supervisors can no longer reach `/finance`. There is therefore no UI path today to confirm message context. The integration also targets the fixed `DEMO_SITE_ID` rather than a selected site. Owner decision 2026-09-21: the queue stays on `/finance`, scoped to the selected site (issue #50). The generic resolution inbox in issue #27 is separate.

What the data path does when mounted:

### Reads

| UI | Source | Rule |
|---|---|---|
| Context rows | `external_message_contexts` | Org/site scoped. |
| Sender/text/time | `list_site_external_messages` RPC over `external_messages` | RPC checks actor/site authority; browser has no raw-table grant. |
| Attachment metadata | `external_message_media` | By message IDs. |
| Area choices | `site_zones` | Site scoped. |
| Task choices | `task_runs` + `service_tasks` | Site scoped. |
| Worker choices | `workers` | Org scoped. |

**Confirm context** updates `external_message_contexts`:
`site_id`, optional zone/task/worker, `sender_role`, `resolution_status='confirmed'`, `resolution_source='manual'`, `confidence=1`, resolved/updated timestamps. RLS allows the update only for `private.can_manage_site` on the context's site.

## /incidents

### Reads

`sites`, `incidents`, `equipment_reports`, `site_zones`, `workers`, `incident_statements`, `incident_actions`, `incident_timeline_events`, `reporting_audit_events`.

### Writes

- `record_incident` -> `incidents`, `incident_statements`, `incident_actions`, `incident_timeline_events`.
- `correct_incident_summary` -> incident summary + timeline + `reporting_audit_events`.
- `record_equipment_report` -> `equipment_reports` in reported state.

No repair completion is invented.

## /reports

### Reads

| UI | Source |
|---|---|
| Site/client | `sites` -> `clients` |
| SLA definition/window/rules | `sla_definitions` |
| Draft/released report | `client_service_reports` |
| Audit/history | `reporting_audit_events` |

### Prepare report

`prepare_client_service_report` reads `sla_definitions`, `sla_task_results`, `task_runs`, `incidents`, `equipment_reports`, site/client context and writes a stored `client_service_reports` snapshot.

### Release report

`release_client_service_report` affects:
- `client_service_reports`
- `client_report_releases`
- `reporting_audit_events`

## /reports/client

1. Find latest released `client_service_reports` row for the site.
2. Call `get_released_client_service_report`.
3. RPC verifies active client_viewer membership + site grant.
4. RPC reads report/release/client/site/SLA records.
5. Return redacted fields only.

Client view does not expose raw evidence, private worker statements, raw messages or internal audit tables.

## /finance accounting imports

| UI | Source |
|---|---|
| CSV preview | `parseFinanceCsv` with current organization sites; no database write |
| Accepted import history | `finance_import_batches` (Director only) |
| Site contribution | `finance_reconciliations` (Director or granted Area Manager) |

`previewFinanceImport` validates source IDs, periods, currency, category, amount, site mapping, approval and recognition. `acceptFinanceImport` hashes the unchanged CSV, calls `stage_finance_csv_import`, then `accept_finance_import`. The hash plus mapping version is the idempotency key. Raw rows and individual labour detail never feed the Area Manager query. Direct contribution is recognized revenue minus direct labour, supplies, repairs and other direct costs; zero revenue produces an N/A margin in the UI.

## Backend/provider mappings

### Official WhatsApp inbound
`/api/webhooks/whatsapp` verifies provider trust boundary, persists `integration_webhook_events` + `processing_jobs`, then the worker normalizes to `external_messages`, media/context and evidence.

### Make WhatsApp transport
`/api/integrations/make/whatsapp/v1` (CLEAN-026) requires `CLEANOPS_MAKE_WHATSAPP_ENABLED=true` (otherwise 404) and a dedicated bearer token, validates the flattened official Cloud API event bundle (JSON or Make-safe URL-encoded scalars, 1 MB cap) and reuses the same durable ingress path (`accept_whatsapp_ingress_event`). The tenant is derived from the receiving phone-number ID in `integration_accounts`; Make does not supply tenant identity. Delivery statuses are handled separately from operational messages. It is a WhatsApp Cloud event adapter, not the generic multi-source intake API proposed in issue #27.

### WhatsApp outbound
`whatsapp_outbox` owns idempotency/retry state; `whatsapp_delivery_events` owns transport history.

### Live OpenAI quality
Budget in `quality_ai_budgets`; provider/cost/cache provenance in `quality_ai_runs`; validated result becomes `quality_decisions`; synthetic evaluation provenance in `quality_ai_evaluations`.

## Agent rules

- Prefer existing authoritative RPC calculations over duplicating aggregates in UI code.
- Keep `service_tasks` (definition) separate from `task_runs` (occurrence).
- Keep worker eligibility separate from app authorization.
- Keep AI suggestion separate from human finding/approval.
- Keep replacement selection separate from attendance.
- Keep provider delivery status separate from task completion.
- For schema detail, read [DATA_DICTIONARY.md](DATA_DICTIONARY.md).
- For multi-step effects, read [PROCESS_FLOWS.md](PROCESS_FLOWS.md).
