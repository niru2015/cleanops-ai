# CleanOps Data Dictionary

Purpose: agent-readable business dictionary for the current CleanOps Supabase model. Exact SQL, constraints, grants, RLS and RPC behavior are owned by `supabase/migrations/`; if this file disagrees with a migration, the migration wins.

Last reviewed: 2026-09-24 for the hosted fixture guard migrations.

## Conventions

- `organization_id` is the cleaning-contractor tenant boundary.
- Site-scoped operational records also carry `site_id`.
- Supabase Auth identifies a person; app authorization comes from `memberships` plus `member_site_access`. `operations_manager` and `organization_administrator` are organization-wide in the app layer and do not need `member_site_access` rows; all other roles do.
- Worker eligibility is separate from app access and uses `worker_site_permissions`.
- Financial transaction rows can be inserted by a Director; since issue #48 a Director can also edit or delete them, with every change audited and `organization_id`/`site_id`/`id` reassignment blocked by trigger. See [Finance and inventory](#finance-and-inventory).
- Demo rows are flagged with `is_demo` (clients, sites, workers, equipment) so they can be told apart from real data.
- `inventory_transactions.total_cost` and `labor_cost_entries.total_cost` are database-generated.
- External messages, media and AI output are untrusted until validated/resolved.
- AI output is advisory; findings and approvals are separate human records.
- Evidence files are private Supabase Storage objects; `task_evidence.storage_path` is metadata, not authorization.

## Access and places

| Table | Meaning | Key fields |
|---|---|---|
| `organizations` | Cleaning contractor tenant. | `name`, `slug`. |
| `memberships` | User role in an organization. | `user_id`, `role`, `state`. Roles include cleaner, site_supervisor, area_manager, operations_manager, organization_administrator, client_viewer. |
| `member_site_access` | Time-bounded app access to a site. | `membership_id`, `site_id`, `starts_at`, `ends_at`. |
| `hosted_demo_fixture_operations` | Current server-only operation lease for the synthetic walkthrough site. | `operation_id`, `site_id`, `actor_user_id`, `action`, `status`, `expires_at`. |
| `hosted_demo_fixture_audit` | Start and outcome record for each hosted prepare, correction or reset command. | `operation_id`, `site_id`, `actor_user_id`, `action`, `status`, `recorded_at`. |
| `clients` | Customer of the cleaning contractor, e.g. casino operator. | `name`, `is_demo`, `demo_note`. |
| `sites` | Physical customer property. | `client_id`, `name`, `city` (2-120 chars when set), `province`, `timezone`, `is_demo`, `demo_note`. |
| `site_zones` | Operational area inside a site. | `site_id`, `name`. |

Role capabilities as implemented in `src/services/access-context.ts` and the finance RLS helpers (the database policies remain the enforcement boundary):

| Role | Sites in scope | Ops / review / incidents | Finance | Cleaner mobile | Reports |
|---|---|---|---|---|---|
| `organization_administrator` (label "Director") | all org sites | yes | view + edit | yes | yes |
| `operations_manager` | all org sites | yes | **no** | no | yes |
| `area_manager` | granted sites | yes | view ledgers/import aggregates, submit and review expenses at granted sites; no cost posting | no | yes |
| `site_supervisor` | granted sites | yes | no finance ledger; expense submission | no | yes |
| `cleaner` | granted sites | no | expense submission only | yes | no |
| `client_viewer` | granted sites | no | no | no | released client report only |

## People, work and staffing

| Table | Meaning | Key fields |
|---|---|---|
| `workers` | Operational worker profile. Login is optional. | `auth_user_id`, `display_name`, `job_title`, `is_demo`, `active`. |
| `worker_site_permissions` | Worker eligibility for a site. | `worker_id`, `site_id`, `state`, `valid_from`, `valid_until`. |
| `service_tasks` | Reusable cleaning task definition. | `site_id`, `name`, `evidence_required`, `active`. |
| `task_schedules` | Recurrence for a task in a zone. | `task_id`, `zone_id`, `recurrence`, `active`. |
| `task_runs` | One scheduled occurrence of work; central operational record. | `task_id`, `zone_id`, `task_schedule_id`, `scheduled_at`, `due_at`, `requirements_snapshot`, `state`, `submission_revision`. |
| `task_run_assignments` | Worker assigned to a specific task occurrence. | `task_run_id`, `worker_id`, `assigned_by`, `assigned_at`. |
| `shifts` | Site shift. | `site_id`, `starts_at`, `ends_at`, `state`. |
| `shift_coverage_requirements` | Required staffed positions. | `shift_id`, `required_positions`. |
| `shift_assignments` | Worker assigned to a shift. | `shift_id`, `worker_id`, `state`. |
| `attendance_events` | Actual attendance events. | `assignment_id`, `event_type`, `occurred_at`, `recorded_by`. |
| `replacement_selections` | Audited supervisor choice of replacement worker. | `shift_id`, `worker_id`, `assignment_id`, `selected_by`, `selected_at`. |

Important rule: a replacement selection does not count as present. Coverage changes after a valid check-in event.

## Durable ingestion and normalized messages

| Table | Meaning | Key fields |
|---|---|---|
| `integration_accounts` | Registered external provider account/receiving number. | `provider`, `external_account_id`, `display_name`, `enabled`, optional `site_id`. Tenant is derived from this record. |
| `integration_webhook_events` | Durable raw provider envelope. | account, provider event ID, `dedupe_key`, `payload`, `payload_sha256`, status, received/processed times, error. |
| `processing_jobs` | Postgres-backed leased retry queue. | event, `kind`, `dedupe_key`, status, attempts, next attempt, lease owner/expiry, error, completion. |
| `external_messages` | Normalized inbound message. Raw text is restricted. | account, provider message/thread IDs, sender, occurrence/receipt times, `text_content`, `media_refs`, schema version. |
| `external_message_contexts` | Supervisor-reviewable operational interpretation. | message, suggested/confirmed site, zone, task run, sender worker/role, resolution status/source/confidence/time. |
| `external_message_media` | Attachment metadata. | message, media kind/external ID, MIME, caption, private storage path, ingestion status. |
| `external_worker_identities` | Verified external sender -> CleanOps worker mapping. | account, sender ID, worker, verification state/time. |
| `conversation_contexts` | Expiring context linking thread/sender to assignment/site/zone/task. | account, thread/sender, assignment, site, zone, optional task run, state, start/expiry. |

## Evidence and quality review

| Table | Meaning | Key fields |
|---|---|---|
| `task_evidence` | Private evidence plus resolved operational linkage. | message/media refs, attributed `worker_id`, authenticated `submitted_by_user_id` (nullable for external/fixture ingress), site/zone/task, `role` before/after, processing/linkage status, resolution code, storage path, MIME/size/hash, source/receipt times, revision. |
| `evidence_pairs` | Before/after pair for one task revision. | task run, revision, before evidence, after evidence. |
| `evidence_audit_events` | Append-only evidence audit history. | evidence, actor, action, reason code, details. |
| `quality_decisions` | Structured Mock AI or live AI assessment. | task/revision/pair, service/version/schema, source label, status, advisory score/confidence, observations, limitations, error. |
| `quality_findings` | Human-confirmed quality issue. | decision, criterion, observation, severity, confirmer/time, resolved time. |
| `corrective_actions` | Remedial work requested after a confirmed finding. | task, finding, source/target revision, state, instruction, request/submission/closure times. |
| `inspections` | Human review outcome for a revision. | task, revision, optional decision, outcome, reviewer, reason. |
| `review_audit_events` | Append-only review history. | task, revision, actor, action, details. |

## Live AI controls

| Table | Meaning | Key fields |
|---|---|---|
| `quality_ai_budgets` | Tenant live-AI gate and budget ceiling. | `live_enabled`, maximum/reserved/spent cents. |
| `quality_ai_runs` | Provider run/cache/retry/cost provenance. | task/revision/pair/cache key, status, attempts, reserved/charged cents, provider/model/prompt/schema, usage/output, latency, resulting decision, error. |
| `quality_ai_evaluations` | Synthetic evaluation provenance. | case, expected/observed outcome, mismatch, abstention, override, run/model/version/cost data. |

Live OpenAI code exists but production execution remains gated by config, budget and provider/business readiness. AI never performs final approval.

## Incidents and equipment

| Table | Meaning | Key fields |
|---|---|---|
| `incidents` | Neutral incident record. | site/zone, idempotency key, occurrence/report times, summary, cause status, state, reporting worker, creator. |
| `incident_statements` | Attributed worker statement. | incident, worker, text, attributed time, recorder. |
| `incident_actions` | Action/note recorded for incident. | incident, action key, note, state, recorder/time. |
| `incident_timeline_events` | Chronological incident history. | incident, event key/type, description, occurrence time, actor. |
| `incident_evidence` | Link between incident and task evidence. | incident, evidence, linker/time. |
| `equipment_reports` | Equipment issue intake, not a full maintenance system. | site/zone, idempotency key, equipment label (free text), issue, state, report time/worker, maintenance reference, resolved time. |
| `equipment_models` | Organization catalogue of machine models. Read by every active role; written only by administrators. | `model_code`, `manufacturer`, `model_name`, `category`, `spec_summary`, `source_url`, `is_demo_reference`. Unique per organization on model code and on manufacturer + model name. |
| `equipment_assets` | Machine register per site (one row per physical unit). Read-only to browser roles; site managers hold RLS insert/update/delete policies but only `select` is granted to `authenticated`, so writes currently come from seed/service role. | `site_id`, `model_id`, `asset_code` (unique per organization), `status`, `condition`, `serial_number`, `runtime_hours`, `last_service_date`, `next_service_date`, `notes`, `is_demo`. |

`equipment_assets.status` is one of `available`, `in_use`, `maintenance`, `out_of_service`, `proposed`; `condition` is one of `new`, `good`, `fair`, `poor`, `not_applicable`. There is no zone, acquisition date, location history or foreign key between `equipment_reports` and `equipment_assets`: a report names its equipment only by free-text label, so repair history cannot yet be attributed to an asset.

## SLA and client reporting

| Table | Meaning | Key fields |
|---|---|---|
| `sla_definitions` | Versioned SLA rule set/window. | name, version, window start/end, numerator/denominator/exclusion rule text. |
| `sla_task_results` | Task-run result under an SLA. | SLA definition, task run, required flag, approved time, exclusion reason. |
| `client_service_reports` | Stored redacted client report snapshot. | client/site/SLA/window, draft/released state, required/approved/excluded counts, completion rate, incident/equipment counts + summaries, safety N/A text, prepare/release provenance. |
| `client_report_releases` | Explicit release record. | client/site/report, releaser/time. |
| `reporting_audit_events` | Append-only audit for reporting and incident corrections/releases. | site, entity type/id, actor, action, reason, redacted changes. |

## Finance and inventory

<a id="finance-and-inventory"></a>

| Table | Meaning | Key fields |
|---|---|---|
| `vendors` | Organization supplier catalogue. | vendor code, name, contact reference, active. |
| `inventory_items` | Cleaning supply catalogue. | SKU, name, category, unit of measure, reorder level, active. |
| `inventory_transactions` | Site stock movement/cost. Legacy direct ledger rows remain Director-editable and audited; CLEAN-017 workflow movements are append-only. | site, optional vendor, item, optional source message/request item, type receipt/issue/adjustment/count or opening/transfer in/out/return/count adjustment in/out, quantity (> 0), unit cost, generated total cost (`round(quantity * unit_cost, 2)`), occurrence time, notes, movement key/leg and actor. |
| `supply_requests` | Assigned-site operational request; approval/order/receipt state is separate from an expense. | organization/site, idempotency key, requester, purpose, CAD estimate currency, status/version, contract supply responsibility snapshot, decision and order reference. |
| `supply_request_items` | Requested product and conversion to the catalogue base unit; estimated price is not a posting. | request, item, pack count, base units per pack, generated base quantity and requested amount, price source/reference, received base quantity. |
| `supply_request_events` | Append-only request decisions, revisions, order and receipt history. | request, event kind, actor, detail, time. |
| `supply_receipts` | Idempotent partial/final delivery linking an approved order item to one stock receipt movement. | request/item, receipt key, base quantity, inventory transaction, receiving actor/time. |
| `supply_stock_counts` | Audited counted quantity and resulting adjustment, including a zero-difference count. | site/item, count key, previous/count quantity, optional adjustment transaction, actor/reason/time. |
| `supply_expense_links` | Director-only source link from one supply receipt to one approved supply expense posting; it does not post an additional cost. | receipt, expense posting, actor/time; each side can be linked once. |
| `labor_cost_entries` | Site labour cost; Director-only read and write, audited. Time-linked postings are immutable snapshots; unlinked rows remain administrative adjustments/import references. | site, optional worker/task/source message/time entry/contract version/project reference, work date, hours (> 0, <= 24), hourly cost, generated total cost (`round(hours * hourly_cost, 2)`), type regular/overtime/contractor, notes. |
| `finance_import_batches` | Immutable record of one accepted/rejected CSV import. Director-only. | organization, source file name/hash, mapping version, currency, service period, state (preview/accepted/superseded/rejected), completeness, accepted_by/at, supersedes_batch_id. |
| `finance_source_rows` | Immutable imported line, one per source document line. Director-only. | batch, source document/line ID, optional site/contract/job/asset reference, optional link to a supply or repair record, service/accounting period, currency, category, amount, tax, approval/recognition/allocation state, raw row JSON. |
| `finance_source_allocations` | Site (and optional job) share of one source row's amount. Director-only. | source row, site, job reference, amount. |
| `finance_reconciliations` | Accepted, approved-actual site totals for a period; the only imported-finance surface open to Area Managers. | batch, site, period, currency, recognized revenue, direct labour/supplies/repairs/other direct cost, generated `direct_contribution`, completeness, `is_current`. |
| `finance_periods` | Director-controlled organization-wide calendar month review and close. | period boundaries, CAD currency, open/review/closed/reopened state, close version, frozen metric snapshot, close actor/time. |
| `finance_period_events` | Append-only period transition and correction history. | period, event kind, close version, snapshot, reopen reason, actor/time. |
| `finance_reconciliation_links` | Audited positive amount from one accepted direct-cost allocation to one posted operational cost. Both sides may be split across different records up to their remaining balance. | period, site, source row/allocation, operational type/id, CAD amount, deterministic/manual rule, rationale, active/voided state. |
| `finance_reconciliation_events` | Append-only match creation and void history. | link, actor/time, rule, amount or correction reason. |
| `finance_ledger_audit_events` | Append-only edit/delete history for both ledgers above. | organization/site, `ledger` (inventory_transaction/labor_cost_entry), `record_id`, actor, action (update/delete), `before`/`after` JSON, time. |

Access (migrations `20260921051826_casino_demo_rbac_equipment`, `20260921120000_clean_029_supply_catalogue_rbac`, `20260921230000_clean_020_reconciled_finance_imports`, `20260922034200_clean_028_finance_ledger_edits`): `inventory_transactions` is readable by a Director or an Area Manager with a grant to that site (`private.can_view_site_finance`); `labor_cost_entries` is readable by a Director only (`private.can_administer_org`), narrowed by CLEAN-020 so individual payroll/labour detail never reaches Area Managers — they see only the aggregate `direct_labour` figure in `finance_reconciliations`. Since issue #48, a Director may also update and delete rows on either ledger (`private.can_edit_site_finance`); Area Managers and every other role remain read-only or have no access at all. `vendors` and `inventory_items` are readable only by Directors, Area Managers and Operations Managers (`private.can_view_supply_catalogue`) and writable only by Directors (`private.can_edit_supply_catalogue`), matching the current `/finance` UI.

A `before update or delete` trigger on both ledgers (`private.log_finance_ledger_change`) enforces edit/delete integrity:
- Rejects any update that changes `organization_id`, `site_id` or `id`.
- Writes a row to `finance_ledger_audit_events` for every real edit/delete, with the actor, action, and before/after state as JSON.
- Skips the audit write (but still allows the operation) when there is no authenticated actor — this is what lets `reset_hosted_demo`'s bulk deletes work without failing; every Director-driven edit/delete goes through a real session and is still audited.

`finance_ledger_audit_events` is a dedicated table, not a reuse of `reporting_audit_events`: its select policy matches the ledgers' own `can_view_site_finance` rule (Director or a granted Area Manager), whereas `reporting_audit_events` uses the broader `can_manage_site`, which would have let site supervisors and operations managers read finance edit history despite having no access to the ledgers themselves.

Fixed (issue #55): `getFinanceWorkspace` now skips the `labor_cost_entries` query entirely for a caller who cannot read it, and `finance-workspace.tsx` shows an explicit "restricted to Directors" message for the labour ledger instead of the empty-state message, so a restricted Area Manager is no longer told the casino simply has no labour records.

## Official WhatsApp outbound

| Table | Meaning | Key fields |
|---|---|---|
| `whatsapp_outbox` | Consent-aware durable outbound queue. | account, recipient, logical idempotency key, payload, consent reference, conversation-window expiry, retry/lease/provider IDs, sent/delivered/read times, error. |
| `whatsapp_delivery_events` | Provider transport history. | account, outbox, provider message ID, status, occurrence time, error. |

Transport status is not task completion or worker acknowledgement.

## Relationship summary

```text
organizations
  -> clients -> sites -> site_zones
  -> memberships -> member_site_access
  -> workers -> worker_site_permissions
  -> service_tasks -> task_schedules -> task_runs
  -> shifts -> shift_assignments -> attendance_events

integration_accounts
  -> integration_webhook_events -> processing_jobs -> external_messages
  -> external_message_contexts / external_message_media
  -> task_evidence -> evidence_pairs
  -> quality_decisions -> quality_findings -> corrective_actions -> inspections

task_runs + sla_task_results + incidents + equipment_reports
  -> client_service_reports -> client_report_releases

vendors + inventory_items -> inventory_transactions -> finance_ledger_audit_events
workers + task_runs -> labor_cost_entries -> finance_ledger_audit_events
finance_import_batches -> finance_source_rows -> finance_source_allocations -> finance_reconciliations

organizations -> equipment_models
sites + equipment_models -> equipment_assets      (no link yet to equipment_reports)
```

## Controlled vocabularies

Postgres enums (values in lifecycle order where one exists):

| Enum / column | Values |
|---|---|
| `app_role` | cleaner, site_supervisor, area_manager, operations_manager, organization_administrator, client_viewer |
| `membership_state` | active, revoked |
| `permission_state` | active, suspended, expired |
| `task_run_state` | planned, ready, in_progress, submitted, correction_required, approved, completed, cancelled |
| `shift_state` | planned, active, completed, cancelled |
| `assignment_state` | assigned, accepted, completed, cancelled |
| `attendance_event_type` | check_in, check_out |
| `integration_provider` | mock_legacy_whatsapp_group, whatsapp_cloud_api |
| `integration_event_status` | pending, processed, failed |
| `processing_job_status` | pending, processing, succeeded, failed |
| `external_identity_state` | verified, revoked |
| `conversation_context_state` | active, switched, expired |
| `evidence_processing_status` | staged, ready, quarantined, missing |
| `evidence_linkage_status` | unresolved, linked, ignored |
| `evidence_role` | before, after |
| `quality_result_status` | assessed, insufficient_evidence, failed |
| `finding_severity` | low, medium, high |
| `corrective_action_state` | open, submitted, closed |
| `inspection_outcome` | correction_required, approved |
| `quality_ai_run_status` | reserved, completed, failed |
| `incident_state` | reported, triaged, action_required, resolved, closed |
| `incident_action_state` | recorded, open, completed |
| `equipment_report_state` | reported, triaged, maintenance_requested, resolved |
| `client_report_state` | draft, released |
| `whatsapp_outbox_status` | pending, processing, sent, delivered, read, failed |

Text columns constrained by `check`:

| Column | Values |
|---|---|
| `external_message_contexts.sender_role` | supervisor, manager, cleaner, system, unknown |
| `external_message_contexts.resolution_status` | unresolved, suggested, confirmed, rejected |
| `external_message_contexts.resolution_source` | manual, deterministic, ai (null until resolved) |
| `external_message_media.media_kind` | image, document, video, audio, sticker |
| `external_message_media.ingestion_status` | pending, downloaded, quarantined, failed |
| `inventory_transactions.transaction_type` | receipt, issue, adjustment, count |
| `labor_cost_entries.cost_type` | regular, overtime, contractor |
| `equipment_assets.status` | available, in_use, maintenance, out_of_service, proposed |
| `equipment_assets.condition` | new, good, fair, poor, not_applicable |
| `finance_import_batches.state` | preview, accepted, superseded, rejected |
| `finance_import_batches.completeness` | complete, incomplete, estimated |
| `finance_source_rows.category` | revenue, direct_labour, supplies, repairs, other_direct_cost, overhead, depreciation, tax, unmapped |
| `finance_source_rows.approval_state` | pending, approved, rejected |
| `finance_source_rows.recognition_state` | actual, estimate, committed |
| `finance_source_rows.allocation_state` | allocated, unallocated |
| `finance_ledger_audit_events.ledger` | inventory_transaction, labor_cost_entry |
| `finance_ledger_audit_events.action` | update, delete |

## Database functions (RPCs)

Business rules that live in the database. "Browser" means callable by `authenticated` (the function still checks role and site); "service" means `service_role` only, i.e. server code or workers.

| Function | Caller | Purpose |
|---|---|---|
| `get_shift_coverage_at` | browser | Required / present / gap for a shift at a time. |
| `record_quality_decision` | service | Store Mock AI or live AI assessment. |
| `confirm_quality_suggestion`, `dismiss_quality_suggestion` | browser | Human confirms (finding + correction) or dismisses an AI suggestion. |
| `approve_submission` | browser | Approve the current task revision; rejects stale revisions. |
| `resolve_evidence_manually`, `ignore_evidence` | browser | Supervisor resolves or ignores unlinked evidence. |
| `record_incident`, `correct_incident_summary` | browser | Neutral incident capture and audited wording correction. |
| `record_equipment_report` | browser | Equipment issue intake in `reported` state. |
| `prepare_client_service_report`, `release_client_service_report` | browser | Build the draft SLA snapshot; explicit release. |
| `get_released_client_service_report` | browser | Redacted client view for an active client_viewer with a site grant. |
| `list_site_external_messages` | browser | Site-authorized raw message text for review (no table grant on `external_messages`). |
| `accept_mock_ingress_event`, `accept_whatsapp_ingress_event` | service | Atomically persist envelope + job before acknowledgement. |
| `claim_processing_job`, `complete_processing_job`, `fail_processing_job`, `retry_failed_processing_job` | service | Leased job queue. |
| `begin_evidence_ingestion`, `finalize_evidence_ingestion`, `mark_evidence_ingestion_problem`, `list_staged_evidence` | service | Evidence staging and verification (mock path). |
| `begin_whatsapp_evidence_ingestion`, `retry_whatsapp_evidence_ingestion` | service | Evidence staging for official WhatsApp media. |
| `enqueue_whatsapp_reply`, `claim_whatsapp_reply`, `mark_whatsapp_reply_sent`, `fail_whatsapp_reply`, `record_whatsapp_delivery_status`, `get_whatsapp_queue_health` | service | Consent-aware outbound queue, delivery history, queue health. |
| `reserve_openai_quality_run`, `finish_openai_quality_run`, `record_quality_ai_evaluation` | service | Capped live-AI reservation, completion and evaluation. |
| `reset_hosted_demo` | service | Site-scoped synthetic demo reset. |
| `stage_finance_csv_import` | browser | Director-only idempotent staging by file hash and mapping version. |
| `accept_finance_import` | browser | Director-only validation, acceptance, supersession and persisted reconciliation. |
| `open_finance_period`, `review_finance_period`, `close_finance_period`, `reopen_finance_period` | browser | Director-only month lifecycle; close checks accepted full-month coverage, source/operational balance, ambiguity and invalid rows/links. |
| `list_finance_match_candidates`, `list_finance_operational_rows`, `run_finance_auto_match`, `match_finance_allocation`, `void_finance_match` | browser | Director-only deterministic proposals and audited matching/correction. |
| `list_finance_period_status`, `list_finance_period_site_status` | browser | Director full close metrics; Director/assigned Area Manager site aggregate without raw labour or accounting rows. |
| `create_manual_contract` | browser | Resolve site/client/organization server-side and create a manual contract plus draft version atomically. |
| `submit_contract_version` | browser | Area Manager or Director sends a draft for review. |
| `approve_contract_version` | browser | Director validates and freezes complete source terms. |
| `preview_contract_activation` | browser | Director-only counts, first expected-revenue period and stale-preview token from approved rows. |
| `activate_contract_version` | browser | Director-only transactional activation of tasks, schedules, coverage, expected revenue and SLA definitions. |

Private helpers used by RLS (schema `private`, not callable by browsers): `has_org_role`, `has_site_access`, `has_operational_site_access`, `can_manage_site`, `can_administer_org`, `can_operate_org`, `is_active_member`, `can_view_site_finance`, `can_edit_site_finance`, `can_view_supply_catalogue`, `can_edit_supply_catalogue`, `resolve_review_actor`, `log_finance_ledger_change` (a `before update or delete` trigger function on both finance ledgers, not an RLS predicate).

## Not implemented (do not assume these exist)

`docs/DATA_MODEL.md` lists logical tables that have no migration: `ai_decisions`, `ai_usage` (superseded by `quality_decisions` and `quality_ai_runs`) and a generic `audit_events` (superseded by `evidence_audit_events`, `review_audit_events` and `reporting_audit_events`).

Tables proposed by open issues #29-#36 and not yet created: announcements and acknowledgements (#29), asset inspections/checklists/repair cost lines (#31; only the read-only `equipment_assets` register exists), absence register (#32), handover and complaints (#36). CLEAN-020 implements neutral finance imports and reconciliation; it does not implement a Sage connector, GL, payments or payroll calculation.

### Accounting reconciliation and period close — CLEAN-038

`demo_scenario_runs` is a service-only hosted demo registry for the deterministic `finance-showcase`
generator. It stores the explicitly targeted project ref, scenario/run/organization IDs, status,
and the generated record-ID registry as JSONB before business writes. RLS is enabled and browser
roles have no table privileges. It is not an application finance source or customer tenant table.

`private.finance_operational_records` normalizes approved expense postings except equipment purchases, posted labour cost, and inventory issues into cost candidates. Historical labour and inventory rows are CAD-only. Accounting import rows remain authoritative and are never added to operational totals a second time. Exact source ID, document reference and amount/date/context rules create candidate proposals; only a unique best proposal may auto-match. A Director may manually link a positive cent-precision amount within both remaining balances. Ambiguous, unmatched, invalid and incomplete rows remain visible as exceptions. Closed periods reject match changes; reopen records a reason and preserves the prior snapshot. A changed accepted import or operational amount makes the closed snapshot stale. No direct browser table writes are granted for periods or links.

### One-off projects — CLEAN-037

`projects` contains the tenant/site-scoped operational scope, optional parent contract, code, state, dates, currency, Director activation and cost-close flags. `project_revenue_terms` holds the approved fixed quote or hourly billing rate; `project_billable_approvals` holds Director-approved billable hours linked to approved operational time; `project_invoices` records explicit invoiced amounts and references. `project_source_links` records Director attribution of immutable expense, inventory issue and accounting allocation rows. The source ledgers also have nullable composite-FK `project_id` columns; existing text references remain unresolved until matched to a project code or explicitly linked. Site mismatches fail the composite foreign keys or RPC checks.

`list_finance_projects` returns expected, invoiced and recognized revenue separately, posted labour, non-capital expense, issued supplies and direct contribution. `list_finance_project_reconciliation` returns source counts for recognized, unresolved and incomplete allocations without exposing raw accounting rows to Area Managers. Recognized contribution and margin are null until cost close and complete accepted actual revenue. Accounting direct-cost allocations are reconciliation evidence, not a second addition to operational costs. Area Manager access is site aggregate only; terms, billable approvals, invoices and worker-level ledger values remain Director-only.

## CLEAN-022 contract foundation

Migration `20260923064804_clean_022_contract_foundation.sql` owns the following organization and site scoped records:

| Table | Business meaning |
|---|---|
| `contracts` | Client/site identity, organization-unique code, draft/active/archived register state and creator. |
| `contract_versions` | Manual/document/amendment source, effective dates, lifecycle, approval/activation actor and time, renewal notes and supply/equipment/repair responsibility. Approved terms cannot be edited through browser policies. Active effective periods may not overlap. |
| `contract_financial_terms` | Repeatable basis, amount, currency, term dates and source reference; custom and variable-rate terms do not invent fixed revenue. |
| `contract_obligations` | Versioned routine or specialist task, zone, recurrence, due window, evidence/inspection and source reference. |
| `contract_staffing_requirements` | Versioned weekday, local start/end time and required positions. Initial activation materializes the first 28 effective days as canonical shifts and coverage rows. |
| `contract_sla_terms` | Versioned numerator, denominator and exclusion rules that activate into `sla_definitions`. |
| `contract_revenue_expectations` | Traceable fixed monthly/annual expected billing periods and amounts, with `is_current` for future supersession. These are neither accounting recognition nor collected cash. |
| `contract_events` | Actor-attributed submitted, approved, activated and superseded events. |

Generated `service_tasks`, `task_schedules`, `shifts`, `shift_coverage_requirements`, `sla_definitions` and later `task_runs` have nullable `contract_version_id` provenance. A task-run insert inherits its schedule's version via `private.bind_task_run_contract_version`; updates cannot change it. Generated tasks, shifts and SLA definitions also point to their source obligation, staffing rule or SLA term. Existing non-contract rows retain null provenance. Task schedule `recurrence` stores the source frequency and effective window; quarterly work is represented as one versioned schedule, not pre-created task runs. Fixed-fee expectations cover up to 12 months from the version start; hourly/per-shift/project/custom terms await approved billable activity or manual resolution.

## CLEAN-034 contract document review

Migration `20260923082248_clean_034_contract_document_extraction.sql` adds a private `contract-documents` Storage bucket (15 MB, PDF/DOCX/JPEG/PNG/WebP) and four organization/site/version-scoped tables:

| Table | Meaning |
|---|---|
| `contract_documents` | Staged or verified original metadata: declared/detected MIME, claimed/verified size and SHA-256, page count, private path, uploader, status and duplicate pointer. The ready hash is unique per contract version. |
| `contract_extraction_runs` | Provider and schema version, document, actor, success/failure code and time. Reruns append history. |
| `contract_extraction_proposals` | Immutable field proposal, business state, source page/span/offsets and classification. Trusted tenant/site/version IDs are attached by the server, never supplied by the extractor. |
| `contract_extraction_decisions` | One immutable human accept/edit/reject/unknown decision per proposal, with reviewed value, actor/time/reason and canonical draft row pointer when applied. |

Direct browser grants on these tables are read-only. Directors and granted Area Managers can read source metadata/runs and all proposals for their sites; Operations Managers can read only operational proposals/decisions and cannot fetch originals or commercial values. The `review_contract_extraction_proposal` RPC checks draft state and role, applies supported accepted/edited values to the CLEAN-022 canonical draft, and records the decision in one transaction. Non-canonical reporting prose remains a review note. A version cannot be approved while a matched source proposal has no human decision. The source document and machine proposal remain separate from the canonical draft.

## CLEAN-035 Finance Inbox and operational expenses

Migration `20260923112308_clean_035_finance_intake_expenses.sql` owns the private `expense-receipts` bucket and these tenant-scoped records:

| Table | Meaning |
|---|---|
| `finance_intake_items` | Durable WhatsApp/app candidate, original source pointer/text, machine proposal, site/project hint and human review state. A candidate has no cost effect. |
| `expense_documents` | Staged or byte-verified receipt metadata and extraction provenance; ready receipts have SHA-256, size and verification time. Originals stay in private Storage. |
| `expense_claims` | Human-reviewed category, vendor, date, payment method, currency, total, context and revision. `receipt_sha256` is unique among posted/reconciled claims per organization. Equipment purchases carry `asset_review_required`; employee-paid claims carry separate reimbursement status. |
| `expense_items` | One classified direct-cost line for the reviewed claim; further line detail can be added by a later owner. |
| `expense_allocations` | Positive site/project shares that must sum to the reviewed total. Project is a reference pending #65. |
| `expense_postings` | Immutable approved cost per allocation with source claim/revision and approving Director; approval retry adds no row. |
| `expense_audit_events` | Immutable submission review, rejection and posting history with actor and reason. |

`submit_app_finance_intake` accepts an assigned-site cleaner/supervisor/Area Manager message; an `external_messages` trigger creates a WhatsApp candidate for expense terms. `resolve_finance_intake` and `reject_finance_intake` require a Director or granted Area Manager; `approve_finance_expense` requires a Director, a verified receipt, balanced allocations and resolved context. All three use server-side role/site checks; browser table access is read-only and role-scoped. CLEAN-035 postings are operational direct costs, not CLEAN-020 accounting imports or payroll/payment records.

## Agent guidance

- For page-to-source details, read [DATA_MAPPING.md](DATA_MAPPING.md).
- For state transitions and multi-step effects, read [PROCESS_FLOWS.md](PROCESS_FLOWS.md).
- Before changing columns, RLS, constraints or RPCs, inspect the owning migration and database tests.

## CLEAN-036 approved time and effective labour cost

Migration `20260923165223_clean_036_time_and_labour_costing.sql` adds:

| Record | Meaning | Key fields and invariant |
|---|---|---|
| `worker_cost_rates` | Confidential Director-owned cost rate for one worker and regular/overtime/contractor class. | Organization + worker, CAD hourly cost (four decimals), effective `[from,to)` interval, active/superseded state, source reference and reason. Active intervals cannot overlap for a worker/class. Posted entries retain their original rate snapshot after a change. |
| `worker_cost_rate_events` | Immutable rate creation, interval close and supersession history. | Before/after, actor, reason and time; Director-only read. |
| `time_entries` | Operational source hours before cost. | Organization/site/worker, optional assignment/shift/task/contract/project provenance, site-local work date, timestamps, up to 24 hours, cost class, draft/exception/approved/rejected/posted state, reviewer, revision and optional posted ledger pointer. One derived row per shift assignment. Missing checkout and cancelled assignment remain exceptions until human review. |
| `time_entry_events` | Immutable derivation, source refresh, manual entry, review and posting history. | Organization/site/time entry, before/after, reason and actor. Contains no hourly rate. |
| `labor_cost_entries.time_entry_id` | One approved cost posting per time entry. | Director-only hourly cost snapshot and generated total; posted time-linked rows cannot be edited or deleted. `contract_version_id` and `project_reference` carry source attribution for later #65/#66 work. |

`derive_shift_time_entry`, `create_manual_time_entry`, and `review_time_entry` require an active operational reviewer with site access. `set_worker_cost_rate` and `post_approved_time_cost` require a Director. Browser roles have no direct write grants on time, rate, or their audit tables. The posting RPC completes both foreign-key links in one transaction. Six-decimal hours are a technical representation of elapsed time, not an overtime or payroll policy; manual input with finer precision is rejected. No statutory deductions, wage calculation or currency conversion is implied.
