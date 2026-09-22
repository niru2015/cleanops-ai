# CleanOps Data Dictionary

Purpose: agent-readable business dictionary for the current CleanOps Supabase model. Exact SQL, constraints, grants, RLS and RPC behavior are owned by `supabase/migrations/`; if this file disagrees with a migration, the migration wins.

Last reviewed: 2026-09-21 against migrations through `20260921070701_site_equipment_assets`.

## Conventions

- `organization_id` is the cleaning-contractor tenant boundary.
- Site-scoped operational records also carry `site_id`.
- Supabase Auth identifies a person; app authorization comes from `memberships` plus `member_site_access`. `operations_manager` and `organization_administrator` are organization-wide in the app layer and do not need `member_site_access` rows; all other roles do.
- Worker eligibility is separate from app access and uses `worker_site_permissions`.
- Financial transaction rows are append-only for browser roles in the current slice. This is enforced by grants (`select, insert` only for `authenticated`), not by a trigger; see [Finance and inventory](#finance-and-inventory).
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
| `clients` | Customer of the cleaning contractor, e.g. casino operator. | `name`, `is_demo`, `demo_note`. |
| `sites` | Physical customer property. | `client_id`, `name`, `city` (2-120 chars when set), `province`, `timezone`, `is_demo`, `demo_note`. |
| `site_zones` | Operational area inside a site. | `site_id`, `name`. |

Role capabilities as implemented in `src/services/access-context.ts` and the finance RLS helpers (the database policies remain the enforcement boundary):

| Role | Sites in scope | Ops / review / incidents | Finance | Cleaner mobile | Reports |
|---|---|---|---|---|---|
| `organization_administrator` (label "Director") | all org sites | yes | view + edit | yes | yes |
| `operations_manager` | all org sites | yes | **no** | no | yes |
| `area_manager` | granted sites | yes | view only, granted sites | no | yes |
| `site_supervisor` | granted sites | yes | no | no | yes |
| `cleaner` | granted sites | no | no | yes | no |
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
| `task_evidence` | Private evidence plus resolved operational linkage. | message/media refs, worker/site/zone/task, `role` before/after, processing/linkage status, resolution code, storage path, MIME/size/hash, capture/receipt times, revision. |
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
| `inventory_transactions` | Append-only site stock movement/cost. | site, optional vendor, item, optional source message, type receipt/issue/adjustment/count, quantity (> 0), unit cost, generated total cost (`round(quantity * unit_cost, 2)`), occurrence time, notes. |
| `labor_cost_entries` | Append-only site labour cost. Director-only read (see below). | site, optional worker/task/source message, work date, hours (> 0, <= 24), hourly cost, generated total cost (`round(hours * hourly_cost, 2)`), type regular/overtime/contractor, notes. |
| `finance_import_batches` | Immutable record of one accepted/rejected CSV import. Director-only. | organization, source file name/hash, mapping version, currency, service period, state (preview/accepted/superseded/rejected), completeness, accepted_by/at, supersedes_batch_id. |
| `finance_source_rows` | Immutable imported line, one per source document line. Director-only. | batch, source document/line ID, optional site/contract/job/asset reference, optional link to a supply or repair record, service/accounting period, currency, category, amount, tax, approval/recognition/allocation state, raw row JSON. |
| `finance_source_allocations` | Site (and optional job) share of one source row's amount. Director-only. | source row, site, job reference, amount. |
| `finance_reconciliations` | Accepted, approved-actual site totals for a period; the only imported-finance surface open to Area Managers. | batch, site, period, currency, recognized revenue, direct labour/supplies/repairs/other direct cost, generated `direct_contribution`, completeness, `is_current`. |

Access (migrations `20260921051826_casino_demo_rbac_equipment`, `20260921120000_clean_029_supply_catalogue_rbac`, `20260921230000_clean_020_reconciled_finance_imports`): `inventory_transactions` is readable by a Director or an Area Manager with a grant to that site (`private.can_view_site_finance`); `labor_cost_entries` is readable by a Director only (`private.can_administer_org`), narrowed by CLEAN-020 so individual payroll/labour detail never reaches Area Managers — they see only the aggregate `direct_labour` figure in `finance_reconciliations`. Only a Director may insert to either ledger (`private.can_edit_site_finance`). Site supervisors and operations managers cannot read either ledger. `vendors` and `inventory_items` are readable only by Directors, Area Managers and Operations Managers (`private.can_view_supply_catalogue`) and writable only by Directors (`private.can_edit_supply_catalogue`), matching the current `/finance` UI.

Known UI gap (not yet filed): `getFinanceWorkspace` still queries `labor_cost_entries` for every `/finance` viewer and `finance-workspace.tsx` renders the "Labour ledger" table unconditionally. RLS returns zero rows for an Area Manager rather than an error, so the table silently shows "No labour cost entries have been recorded." — indistinguishable from an actually empty ledger. The component should hide or relabel that section when `editable` is false.

Append-only is grant-based: `authenticated` holds `select, insert` on both ledgers. The later migration also created `update` and `delete` policies for Directors, but with no matching grant they have no effect for browser roles; `service_role` can still modify rows. Owner decision 2026-09-21: grant Directors update and delete deliberately (issue #48), so these policies will become active and "append-only" will no longer hold. Until that migration lands, treat them as inert.

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

vendors + inventory_items -> inventory_transactions
workers + task_runs -> labor_cost_entries
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

Private helpers used by RLS (schema `private`, not callable by browsers): `has_org_role`, `has_site_access`, `has_operational_site_access`, `can_manage_site`, `can_administer_org`, `can_operate_org`, `is_active_member`, `can_view_site_finance`, `can_edit_site_finance`, `can_view_supply_catalogue`, `can_edit_supply_catalogue`, `resolve_review_actor`.

## Not implemented (do not assume these exist)

`docs/DATA_MODEL.md` lists logical tables that have no migration: `ai_decisions`, `ai_usage` (superseded by `quality_decisions` and `quality_ai_runs`) and a generic `audit_events` (superseded by `evidence_audit_events`, `review_audit_events` and `reporting_audit_events`).

Tables proposed by open issues #29-#36 and not yet created: announcements and acknowledgements (#29), supply requests/orders/stock (#30; only the `inventory_*` ledger exists), asset inspections/checklists/repair cost lines (#31; only the read-only `equipment_assets` register exists), absence register (#32), contract obligations and ad-hoc jobs (#35), handover and complaints (#36). CLEAN-020 implements neutral finance imports and reconciliation; it does not implement a Sage connector, GL, payments or payroll calculation.

## Agent guidance

- For page-to-source details, read [DATA_MAPPING.md](DATA_MAPPING.md).
- For state transitions and multi-step effects, read [PROCESS_FLOWS.md](PROCESS_FLOWS.md).
- Before changing columns, RLS, constraints or RPCs, inspect the owning migration and database tests.
