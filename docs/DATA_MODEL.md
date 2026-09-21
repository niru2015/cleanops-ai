# Logical data model

The design contract below sets intent. CLEAN-002 migration
`supabase/migrations/20260915160856_cleanops_foundation.sql` owns exact Phase-1 columns,
indexes, constraints, grants and policies. CLEAN-003 migration
`supabase/migrations/20260916053638_durable_mock_ingestion.sql` owns exact integration account,
raw envelope, processing job and normalized message structures and RPCs. CLEAN-004 migration
`supabase/migrations/20260916061705_operational_evidence.sql` owns verified identities,
conversation contexts, evidence, pairing, audit and private Storage policies.
The CLEAN-005 migrations own quality decisions, confirmed findings, corrective actions,
revision inspections, review audit events and guarded supervisor RPCs.
The CLEAN-006 migration owns shift coverage requirements, worker-to-task assignments and
audited human replacement selections. The CLEAN-007 migration owns incident statements,
evidence links, actions and timeline events; equipment reports; versioned SLA results; redacted
client report snapshots, releases and reporting audit events.
The CLEAN-009 migration owns official receiving-account events, the WhatsApp outbox, transport
delivery events, queue-health RPC and official-media entry into the existing evidence tables.
Every tenant-owned table has UUID id, organization_id, created_at; mutable records add
updated_at and revision where concurrency matters. Auth users are identities, not tenants.

## Phase 1–2 tables

| Group | Tables and key relationships |
|---|---|
| Access | organizations; memberships(user_id, role); member_site_access(membership, site) |
| Places | clients(is_demo) → sites(client, city, province, timezone, is_demo) → site_zones |
| Equipment | equipment_models(organization, model code, manufacturer, model, category); equipment_assets(site, model, asset_code, status, condition, service dates, runtime hours); equipment_reports(site, zone, free-text equipment label, issue state). No zone on assets and no asset link on reports yet. |
| People | workers(user_id optional); worker_site_permissions(worker, site, validity) |
| Work | service_tasks; task_schedules(task, zone); task_runs(schedule, zone, due_at, requirements snapshot, state, submission_revision) |
| Staffing | shifts(site, starts_at, ends_at); shift_coverage_requirements(shift, positions); shift_assignments(shift, worker); attendance_events(assignment, type, occurred_at); replacement_selections(shift, worker, selector) |
| Task allocation | task_run_assignments(task_run, worker, assigner, assigned_at) |
| Inbound | integration_accounts(provider, external account, secret reference); integration_webhook_events(account, dedupe_key, payload, status) |
| Normalized | external_messages(account, provider message ID, sender, received_at, occurred_at, status); external_message_contexts(message, casino site, area/zone, task run, sender worker/role, resolution status); external_message_media(message, media ID, image/document metadata, private storage state) |
| Resolution | external_worker_identities(account, sender, worker, verified_at); conversation_contexts(account, thread, sender, task, expiry) |
| Media | task_evidence(task_run nullable, message, role, storage_path, hash, captured_at nullable, received_at, submission_revision) |
| Review | quality_decisions(task_run, submission_revision, pair, structured output); quality_findings(decision, confirmed observation); corrective_actions(finding, source/target revision, state); inspections(task_run, revision, reviewer, outcome); review_audit_events |
| AI quality | quality_ai_budgets(tenant live ceiling); quality_ai_runs(tenant cache, attempt, provider metadata, usage, conservative charge); quality_ai_evaluations(fixture mismatch, abstention, override, provenance) |
| AI (logical only, not migrated) | ai_decisions and ai_usage were planned; implemented as quality_decisions and quality_ai_runs above |
| Reliability | processing_jobs(kind, dedupe_key, lease, attempts, next_attempt_at, status); a generic audit_events table was not built: append-only evidence_audit_events, review_audit_events and reporting_audit_events are used instead |
| WhatsApp outbound | whatsapp_outbox(account, recipient, logical_key, consent reference, conversation expiry, payload, lease, provider ID, transport state); whatsapp_delivery_events |
| Finance / inventory | vendors(organization, supplier); inventory_items(organization, SKU, unit and reorder level); inventory_transactions(site, vendor, item, quantity, unit cost, total cost, source message); labor_cost_entries(site, worker/task, work date, hours, hourly cost, total cost, source message) |

CLEAN-003 implements integration_accounts, integration_webhook_events, processing_jobs and
external_messages. CLEAN-004 implements external_worker_identities, conversation_contexts,
task_evidence, evidence_pairs and evidence_audit_events. CLEAN-005 implements the review group;
the CLEAN-006 staffing and task-allocation records support the connected PWA and command view;
official WhatsApp records are implemented in CLEAN-009. Acceptance and evidence RPCs derive organization_id from the enabled registered
account; callers cannot supply tenant identity.

Tenant links must agree: use organization-scoped composite foreign keys or equivalent
constraints, not just UUID references. Check site consistency through task/zone/shift
relationships. Explicitly test guessed cross-tenant and cross-site IDs on writes.
Membership and worker/site permission serve different purposes: app access vs work eligibility.

## Uniqueness and invariants

- membership: (organization_id, user_id); site grant: (membership_id, site_id).
- message: (integration_account_id, external_message_id); identity: (account_id, sender).
- envelope: (account_id, dedupe_key); job: (organization_id, kind, dedupe_key).
- outbound reply: (organization_id, logical_key); provider delivery event is unique by account,
  provider message ID, status and provider occurrence time.
- evidence: (integration_account_id, external_message_id, media_external_id); one linked role per
  task revision; paired AFTER is unique;
  PWA uploads use a client request UUID scoped to authorized worker.
- task occurrence: (task_schedule_id, scheduled_at); assignment: (shift_id, worker_id).
- AI request: (service, task_run_id, submission_revision, input_hash, prompt_version).
- Human approval locks the current task revision; stale decisions and later evidence cannot
  change an approved revision.
- Store original object hash and source reference; corrections append records, not overwrite.
- captured_at is nullable and source-reported; received_at is server-owned. Neither proves presence.
- Audit events are append-only through restricted server operations, with redacted changes.

## Phase 3 and later

P3 implements incidents, incident_statements, incident_evidence, incident_actions,
incident_timeline_events, equipment_reports, sla_definitions, sla_task_results,
client_service_reports, client_report_releases and reporting_audit_events. Released reports are
redacted snapshots; client access reuses active membership and site grants.
The CLEAN-027 migrations add the finance/inventory tables and normalized message context/media
tables. Registered-account site is a deterministic suggestion created with each normalized message;
a supervisor confirms the area, task and sender. Raw message text remains worker-only and is exposed
to supervisors through a site-authorized queue RPC, never a browser table grant. Every record carries
an organization scope; site, area, task, worker and source-message links use composite tenant foreign
keys. Generated total-cost columns prevent inconsistent labour and inventory totals. Financial entries
are append-only for browser roles in this slice (grants allow select and insert only): a correction is a new adjustment or labour entry.
Since `20260921051826` the ledgers are readable only by Directors and granted Area Managers and writable only by Directors.
The same migration adds `equipment_models` and `equipment_assets` and the `is_demo` flags; `20260921070701` grants them to `authenticated` read-only.

Later: supply requests; contracts/requirements; certifications/training; safety schedules/checks/escalations;
equipment/maintenance; knowledge documents/chunks/embeddings. Define each schema when its issue starts,
not as speculative migrations.

Raw envelopes/media have restricted retention and access. Unresolved evidence stays tenant-scoped
without an invented site/task. Cross-site reassignment requires authorized review and audit.
Index tenant/site foreign keys and worker-claim/status queries as migrations are implemented.
