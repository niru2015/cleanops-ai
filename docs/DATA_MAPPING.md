# CleanOps Data Mapping

Purpose: source-to-target map for implemented pages and server workflows. Exact behavior is owned by current code, migrations and tests.

Last reviewed: 2026-09-21.

## Route summary

| Route | Main implementation | Purpose |
|---|---|---|
| `/login` | `src/app/login`, hosted-demo services | Supabase Auth and role/site-gated entry. |
| `/operations` | operations Supabase integration + actions | Staffing, replacements, zones, review/correction/SLA risk. |
| `/mobile` | operations integration + mobile actions | Cleaner task context and before/after photo capture. |
| `/review` | review Supabase integration + actions | Evidence pair, AI suggestion, findings, corrections, approval. |
| `/finance` | finance + message-context integrations | Supplier/item setup, inventory/labour, WhatsApp context queue. |
| `/incidents` | reporting integration + incident actions | Incident and equipment intake/correction. |
| `/reports` | reporting integration + report actions | SLA snapshot preparation and release. |
| `/reports/client` | reporting integration | Released-only redacted client report. |

## /login

| UI/behavior | Source | Rule |
|---|---|---|
| Sign-in | Supabase Auth | Cookie-bound session. |
| Organization role | `memberships.role/state` | Active membership required. |
| Site access | `member_site_access` | Active site grant required for hosted capability. |
| Supervisor/cleaner/client perspective | membership role + hosted capability | Page runtime checks capability before loading workflow data. |

## /operations

### Reads

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

Real upload code is present on main; CLEAN-011 tracking docs should remain aligned with acceptance/deployment status.

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

### Reads

| UI | Source |
|---|---|
| Supplier options | active `vendors` |
| Inventory item options | active `inventory_items` |
| Worker options | `workers` |
| Task options | `task_runs` + `service_tasks` |
| Inventory ledger | `inventory_transactions` + item/vendor joins |
| Labour ledger | `labor_cost_entries` + worker join |

### Writes

| Action | Table | Key mapping |
|---|---|---|
| Add supplier | `vendors` | organization, name, code, contact reference |
| Add item | `inventory_items` | organization, SKU, name, category, unit, reorder level |
| Record stock movement | `inventory_transactions` | organization/site, vendor optional, item, type, quantity, unit cost, time, notes |
| Record labour | `labor_cost_entries` | organization/site, worker/task optional, date, hours, hourly cost, cost type, notes |

`total_cost` is database-generated.

## /finance — WhatsApp context queue

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
`site_id`, optional zone/task/worker, `sender_role`, `resolution_status='confirmed'`, `resolution_source='manual'`, `confidence=1`, resolved/updated timestamps.

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

## Backend/provider mappings

### Official WhatsApp inbound
`/api/webhooks/whatsapp` verifies provider trust boundary, persists `integration_webhook_events` + `processing_jobs`, then the worker normalizes to `external_messages`, media/context and evidence.

### Make WhatsApp transport
`/api/integrations/make/whatsapp/v1` validates the flattened official Cloud API event bundle and reuses the same durable ingress path. Make does not supply tenant identity.

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
