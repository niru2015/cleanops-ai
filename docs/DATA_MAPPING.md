# CleanOps Data Mapping

Purpose: source-to-target map for implemented pages and server workflows. Exact behavior is owned by current code, migrations and tests.

Last updated: 2026-09-24 for hosted fixture commands.

## Route summary

Roles per route come from `src/config/navigation.ts` and the page guards; RLS/RPCs remain the enforcement boundary.

| Route | Roles | Main implementation | Purpose |
|---|---|---|---|
| `/login` | anonymous | `src/app/login`, hosted-demo services | Supabase Auth with a named demo persona selector. |
| `/operations` | supervisor, area manager, operations manager, director | site-portfolio + operations Supabase integrations + actions | Portfolio of every accessible site; staffing, replacements, zones, review/correction/SLA risk for the walkthrough site. |
| `/mobile` | assigned demo cleaner, authorized supervisor/manager | operations integration + mobile actions | Assigned task selection, before/after photo capture and corrected after upload; supervisor actions are attributed separately from the worker. |
| `/mobile/expenses` | cleaner, site supervisor, area manager | expense submission and receipt actions | Assigned-site expense message and private receipt upload. |
| `/review` | supervisor, area manager, operations manager, director | review Supabase integration + actions | Selected task's private signed images, AI suggestion, findings, corrections and approval. |
| `/finance` | area manager (read only), director (read + write) | finance integration + actions | Site-scoped supplier/item setup, inventory and labour ledgers, accepted accounting summaries, and the message context queue. Missing accounting import tables show a partial availability notice. |
| `/finance/inbox` | granted area manager, director | expense integration + review actions | Candidate, source/receipt link, deterministic proposal and human resolution. |
| `/finance/expenses` | granted area manager, director | expense integration + Director approval action | Reviewed claims, source drill-through, allocations and posted cost. |
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

**Reset shared synthetic walkthrough**
`performOperationsAction` requires hosted demo access, takes a server-side operation lease,
calls the site-scoped `reset_hosted_demo` RPC, then removes only returned private evidence paths.
The lease start/outcome is recorded in `hosted_demo_fixture_audit`; concurrent fixture commands
return a conflict state. In local simulator mode the existing token-gated path remains separate.

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
- require exact synthetic site, worker assignment, signed-in cleaner or authorized supervisor, and expected before/after role;
- create durable ingress -> `integration_webhook_events` + `processing_jobs`;
- normalize to `external_messages`;
- stage `task_evidence` and record authenticated `submitted_by_user_id` separately from attributed `worker_id`;
- issue a single-path signed private Storage upload token.

**Finalize photo**
- verify signed application ticket and user;
- match the selected task's source thread, expected role and current revision;
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

The manager summary at the top of `/finance` resolves the requested month and permitted sites from
`getAppAccessContext`, then reads current `contract_revenue_expectations`, current accepted
`finance_reconciliations`, and `list_finance_period_site_status`. The server service computes
contribution and margin only for a complete accepted import and a non-stale closed period.
Without an explicit month, the overview opens the latest complete, current closed month visible
to the account; otherwise it opens the current month. All assigned sites are compared by default.
Approved operational expense postings are grouped by the underlying claim's expense date and
category; approved hours and Director-only posted labour are separate source indicators. These
operational amounts are displayed separately and never added to accepted accounting totals.
Expected contract revenue is displayed separately from recognized accounting revenue. Multi-site
totals add source numerators before dividing for margin; mixed currency and incomplete site sets
show N/A. Versioned read-only review prompts identify pending finance intake, unmatched costs,
stale close, and material expected/recognized revenue variance. Links open the owning workspace.
Area Managers receive only assigned-site aggregate labour, with no worker rate or ledger query.

Access: Directors read and write everything below; Area Managers read the inventory ledger and the accepted-import reconciliation summary (§/finance accounting imports) for their granted casinos, but not the labour ledger or any import detail; every other role sees "Finance access restricted". A `siteId` query parameter (validated against the account's sites) selects the casino; the default is the first accessible site.

`getAppAccessContext` resolves one active membership and its `organizationId` before any finance
query. `getFinanceSiteContext` validates the selected site against that membership and supplies
organization/site/actor/capability values to both finance and message repositories. Finance actions
derive organization from the same context; import staging passes that authenticated organization to
the Director-only RPC. Multiple active memberships require a future explicit selector and currently
fail closed. The demo tenant constants are not used by these generic paths.

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
The finance and message repositories load task, item, vendor and worker names through separately
organization/site-scoped queries, then join by ID in server memory. This avoids relying on an
unavailable PostgREST embedded relationship for composite task foreign keys. Only active vendors
and items appear as entry choices; historical ledger rows can still display inactive names.

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

The original ledger forms predate the accepted accounting import and source-backed finance overview described below; do not read their entries as the only finance source. The current CSV import, `finance_reconciliations`, contract expected revenue and per-site contribution are implemented in the later sections of this map. `source_message_id` exists on the two older direct ledgers but those forms do not set it; normal expense intake and approved-time posting use their dedicated source-linked flows.

## /finance — WhatsApp context queue

Fixed (issue #50): `MessageContextQueue` is rendered on `/finance` below the ledgers, for both Director and Area
Manager, scoped to the selected casino. `getMessageWorkspace` and `list_site_external_messages` now take the
selected `siteId` instead of the fixed `DEMO_SITE_ID`. `performMessageResolution` was rewired onto the same
`createSupabaseServerClient`/`getAppAccessContext` pattern as every other finance action (it previously used the
hosted-demo `getOperationsRuntime("supervisor")` runtime, a leftover from before the role-scoped finance rework in
PR #43 removed supervisors from `/finance`). Confirming context is treated as an operational action, not a finance
write: an Area Manager may confirm even though `canEditFinance` (Director-only) governs the ledgers — RLS
(`private.can_manage_site`) already permitted this and is unchanged. The generic resolution inbox proposed in issue
#27 is a separate, larger piece of work.

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

## /mobile/expenses, /finance/inbox and /finance/expenses

| UI/action | Source and effect |
|---|---|
| Assigned-site submission | `submit_app_finance_intake` writes `finance_intake_items` with authenticated submitter. The normalized WhatsApp `external_messages` trigger writes the other intake source. |
| Receipt upload | A short scoped upload ticket permits direct private Storage upload. Server finalization reloads bytes, checks MIME signature, size and SHA-256, then marks `expense_documents` ready. |
| Candidate/source | `src/integrations/finance/supabase-expenses.ts` reads role/site-scoped intake, document and claim rows. A signed download URL is issued only after the same read authorization. |
| Suggestion | `suggestExpense` parses source text and bounded receipt text/OCR deterministically; validated proposed fields and extraction provenance are stored separately from the claim. |
| Review/rejection | `resolve_finance_intake` or `reject_finance_intake` checks the active Director or granted Area Manager and records a human action in `expense_audit_events`. A review creates/updates a submitted claim, item and balanced allocation; it does not post cost. |
| Approval | `approve_finance_expense` checks Director authorization, resolved site, verified receipt, item/total and allocations, and duplicate posted receipt hash. It atomically writes immutable `expense_postings` and audit; retry returns the existing claim. |
| Posted expense | `/finance/expenses` shows source message, original receipt, site/project allocation, approval actor and direct cost. Employee reimbursement is a separate pending state; equipment purchase is flagged for asset review. |

These postings do not mutate CLEAN-020 `finance_reconciliations`; #66 owns accounting reconciliation and period close.

## /finance accounting imports

| UI | Source |
|---|---|
| CSV preview | `parseFinanceCsv` with current organization sites; no database write |
| Accepted import history | `finance_import_batches` (Director only) |
| Site contribution | `finance_reconciliations` (Director or granted Area Manager) |

`previewFinanceImport` validates source IDs, periods, currency, category, amount, site mapping, approval and recognition. Optional operational reference type and ID must appear together; the type must be one of `supply_invoice`, `supply_receipt`, `repair_invoice` or `repair_report`, and the ID must be a UUID. Invalid references produce row-specific preview errors. `acceptFinanceImport` reparses the unchanged CSV, hashes it, calls `stage_finance_csv_import`, then `accept_finance_import`. The hash plus mapping version is the idempotency key. Raw rows and individual labour detail never feed the Area Manager query. Direct contribution is recognized revenue minus direct labour, supplies, repairs and other direct costs; zero revenue produces an N/A margin in the UI.

## /finance/contracts — manual contract setup and review

`/finance/contracts` lists only contracts at sites in `getAppAccessContext`. Director and assigned Area Manager can open `/finance/contracts/new`; Operations Manager sees the operational register/review but never queries `contract_financial_terms` or expected revenue. `create_manual_contract` derives client and organization from the authorized site. Each wizard section writes its normalized draft row before moving on; reload reads the saved version and children. `/finance/contracts/[id]/review` reads the latest version with organization/site filters, displays unresolved terms, and calls the Director-only preview RPC immediately before activation.

| UI/action | Source or write |
|---|---|
| Contract register | `contracts` + `contract_versions` by authorized organization/site |
| Identity create | `create_manual_contract` RPC |
| Dates/responsibilities | Draft `contract_versions` update |
| Billing, staffing, recurring/specialist work, SLA | `contract_financial_terms`, `contract_staffing_requirements`, `contract_obligations`, `contract_sla_terms` draft inserts and scoped removal for correction |
| Resolve an existing obligation zone | `assign_contract_obligation_zone` validates draft, actor, obligation and same-site zone, then updates `contract_obligations.zone_id` and appends a `contract_events` audit record |
| Return submitted version for revision | `return_contract_version_to_draft` validates the editor, site, `in_review` state and reason, restores `draft` on the same `contract_versions` row and appends an actor-stamped `contract_events` record; repeated submissions each receive a distinct event ID |
| Submit/approve/preview/activate | Dedicated RPCs; activation writes canonical operational rows and `contract_revenue_expectations` transactionally |

Expected revenue is a contract projection and does not enter CLEAN-020 `finance_reconciliations` as recognized revenue. The manager finance overview remains issue #34.

### Contract document upload and extraction (CLEAN-034)

The `/finance/contracts/[id]/review` panel reads `contract_documents`, `contract_extraction_proposals` and `contract_extraction_decisions` for its current version. `prepareContractDocumentUpload` checks the authenticated Director or assigned Area Manager and current draft, records a staged document with a server-selected path, and issues a short signed Storage upload token. The browser sends file bytes directly to the private `contract-documents` bucket. `finalizeContractDocumentUpload` re-downloads the object with the privileged server client, checks byte count, content signature, SHA-256 and page limit, then marks it ready or duplicate. Bad content is rejected. No file bytes pass through a Next.js request body.

`extractContractDocument` downloads only a ready document, uses native PDF or DOCX text extraction before bounded image/PDF OCR, validates the provider result and exact source span against the text, then appends a run and immutable proposals. Failures append a failed run and leave the manual wizard usable. `recordContractExtractionDecision` calls a transaction RPC to apply reviewed values to the existing draft rows; extraction alone never activates, approves, schedules or posts revenue. Submission requires decisions on all matched material proposals. A submitted version can be returned to draft with an audited reason to finish source review, preserving documents and prior decisions. The original download route checks document RLS and site access before issuing a 60-second private signed URL. Operations Managers see only operational snippets and can record an operational decision without writing canonical contract values.

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

## /finance/time and /finance/rates — CLEAN-036

## /finance/projects — CLEAN-037

## /finance/reconciliation — CLEAN-038

`supabase-reconciliation.ts` loads `list_finance_period_site_status` for the Director or a granted Area Manager. The Area path stops there. The Director path also loads `list_finance_period_status`, accepted batches and source allocations, link audit, deterministic proposals and `list_finance_operational_rows`. The page shows coverage and positive unresolved balances explicitly; a missing batch is never presented as a zero close. `reconcileFinance` validates form input with Zod and the current Director membership before invoking the period/match RPCs. SQL repeats the role and tenant checks. Links associate accepted accounting allocation amounts with posted operational costs; they do not change either ledger or the contribution calculation. The `/finance` overview links to this workspace.

The server page calls `list_finance_projects` and `list_finance_project_reconciliation` for only authorized sites and reads project dates for the month filter. The Director source drill-through reads linked time-cost, expense, inventory-issue and accounting-allocation records; Area Managers receive aggregate RPC results without individual worker costs. `performProjectAction` validates each action with Zod and current membership, then calls database RPCs that repeat organization/site and Director checks. Create and assigned-site scope editing are operational drafts; activation and cancellation are Director-only. Billable time approval references approved project time. Invoices and accepted accounting revenue remain separate. `project_source_links` associates immutable posted sources; project totals never add accounting direct costs again.

| Surface | Read path | Write path |
|---|---|---|
| `/finance/time` | `supabase-time.ts` loads site-filtered `time_entries`, `shift_assignments`, `worker_site_permissions`, worker labels and site labels. The browser receives no worker rate or ledger amount. | `performTimeAction` validates Zod input and current site membership, then calls `derive_shift_time_entry`, `create_manual_time_entry`, `review_time_entry` or Director-only `post_approved_time_cost`. SQL repeats role/site checks and records audit. |
| `/finance/rates` | Director guard precedes the `worker_cost_rates` query; Area Managers receive no rate payload. | `saveWorkerCostRate` validates CAD, date, amount and reason, then calls Director-only `set_worker_cost_rate`; overlap prevention and audit are database-owned. |
| `/finance` | The finance repository treats only `PGRST205`/`42P01` missing accounting/time tables as unavailable optional sections. Other finance records and the message queue continue loading; the UI names the missing schema. | Normal labour cost uses `/finance/time`; the older direct ledger form is labelled administrative adjustment and requires a reason or import reference. |

Elapsed attendance time is derived from the check-in/out instants and assigned to the site's local start date. A reviewer explicitly chooses regular, overtime or contractor class; the system does not infer overtime from duration. The Director posting RPC selects the one active rate covering that date and snapshots it into `labor_cost_entries`; its generated amount is rounded to cents. `/finance/reconciliation` links this posted cost to an accepted accounting allocation.
