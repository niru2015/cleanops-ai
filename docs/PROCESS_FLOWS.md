# CleanOps Process Flows

Purpose: implementation-aligned end-to-end flows for coding agents. Migrations, services and tests remain authoritative.

Last reviewed: 2026-09-21.

## 1. Authentication and site authorization

```text
Supabase Auth
  -> memberships (active role)
  -> member_site_access (active site grant)
  -> role-specific runtime/page
```

Rules:
- Auth proves identity only.
- Membership establishes organization + role.
- Site grant establishes which site the user may access.
- RLS/RPC checks are the enforcement boundary.
- Worker eligibility uses `worker_site_permissions`, not app membership.

## 2. Staffing coverage and replacement

```text
shift_coverage_requirements
shift_assignments
attendance_events + worker_site_permissions
        |
        v
get_shift_coverage_at
        |
        v
required / present / gap
        |
        +-- gap > 0 --> supervisor selects eligible worker
                          -> shift_assignments
                          -> replacement_selections
                          -> worker arrives
                          -> attendance_events check_in
                          -> recalculate coverage
```

Key rule: **selected is not present**. Coverage changes only after a valid check-in.

## 3. Cleaner mobile context and evidence

```text
/mobile task
  -> select work area / QR context
  -> conversation_contexts
  -> choose/take JPEG PNG WebP
  -> validate expected before/after role
  -> durable ingress
  -> integration_webhook_events + processing_jobs
  -> external_messages
  -> staged task_evidence
  -> signed private Storage upload
  -> server downloads uploaded bytes
  -> verify source/signature/MIME/size/hash
  -> finalize task_evidence
  -> linked or unresolved
  -> evidence_pairs / submission revision
```

Rules:
- QR/context selection does not record attendance or prove identity.
- Browser never receives privileged credentials.
- Evidence storage is private.
- BEFORE must precede AFTER in the current mobile demo.
- Source capture time is not proof of physical presence.

## 4. External WhatsApp inbound

```text
Meta Cloud API or Make transport
  -> trust-boundary validation
  -> integration_accounts receiving account
  -> derive organization + suggested site
  -> atomic integration_webhook_events + processing_jobs
  -> acknowledge only after durable persistence
  -> leased worker
  -> external_messages
  -> external_message_contexts
  -> external_message_media
  -> identity/context resolution
  -> linked operational evidence OR supervisor queue
```

Rules:
- Never trust caller-supplied tenant identity.
- Message dedupe is account + provider message ID.
- Unknown sender/conflicting context stays unresolved.
- Do not assume arbitrary existing WhatsApp group access.
- Raw message text is exposed only through the authorized RPC path.

## 5. Supervisor message context review

```text
external_message_contexts
+ list_site_external_messages RPC
+ external_message_media
        |
        v
/finance message queue
        |
        v
supervisor confirms area/task/sender role/worker
        |
        v
external_message_contexts resolution_status=confirmed
```

Receiving-account site is a deterministic suggestion; supervisor confirms finer context.

## 6. Evidence quality review and correction

```text
evidence_pairs current revision
  -> quality_decisions
  -> supervisor decision
      -> dismiss -> review_audit_events
      -> confirm -> quality_findings
                   -> corrective_actions
                   -> inspection correction_required
                   -> cleaner submits correction
                   -> new revision + evidence pair
                   -> reassess
      -> approve current revision
                   -> inspections approved
                   -> review_audit_events
```

Rules:
- AI output is advisory only.
- A score is not a finding until a human confirms it.
- Stale-revision actions are rejected.
- Corrections create a new revision instead of overwriting history.
- Approval targets the latest/current revision.
- AI failure leaves manual review usable.

## 7. Live OpenAI quality

```text
verified redacted pair derivatives
  -> quality_ai_budgets
  -> reserve capped run
  -> OpenAI adapter
  -> strict output validation
  -> quality_ai_runs
  -> quality_decisions
  -> human review
```

Provider-gated: implementation exists; live use still requires enabled config, budget and provider/business readiness.

## 8. Incident flow

```text
supervisor records incident
  -> record_incident RPC
  -> incidents
  -> incident_statements
  -> incident_actions
  -> incident_timeline_events

wording correction
  -> correct_incident_summary
  -> updated neutral summary
  -> new timeline event
  -> reporting_audit_events
```

Rules:
- Record facts neutrally.
- Do not infer cause.
- Corrections are audited.
- Evidence links use `incident_evidence`.

## 9. Equipment issue flow

```text
equipment problem reported
  -> record_equipment_report
  -> equipment_reports state=reported
  -> available to reporting summary
```

Current scope is intake only, not a full maintenance/CMMS lifecycle.

## 10. SLA and client release

```text
sla_definitions
+ sla_task_results + task_runs
+ incidents
+ equipment_reports
        |
        v
prepare_client_service_report
        |
        v
client_service_reports draft snapshot
        |
        v
supervisor release?
  no -> client sees nothing
  yes
   -> release_client_service_report
   -> client_service_reports released
   -> client_report_releases
   -> reporting_audit_events
   -> authorized client_viewer + site grant
   -> get_released_client_service_report
   -> /reports/client redacted output
```

Client visibility requires explicit release and active client-viewer site authorization.

## 11. Finance — supplier and inventory

```text
create supplier -> vendors
create item     -> inventory_items

vendor + item + site + quantity + unit cost
  -> inventory_transactions
  -> database total_cost = quantity * unit_cost
  -> inventory ledger
```

Transaction types: receipt, issue, adjustment, count. Current ledger is append-only.

## 12. Finance — labour

```text
site + work date + hours + hourly cost + type
+ optional worker
+ optional task run
  -> labor_cost_entries
  -> database total_cost = hours * hourly_cost
  -> labour ledger
```

Cost types: regular, overtime, contractor. This is operational cost capture, not payroll.

## 13. Official WhatsApp outbound

```text
authorized reply request
  -> validate tenant/recipient/consent
  -> whatsapp_outbox
  -> leased worker
  -> send/retry/fail
  -> provider transport callbacks
  -> whatsapp_delivery_events
  -> outbox sent/delivered/read timestamps
```

Messaging transport state must not change attendance or task completion.

## 14. Hosted demo reset

The supervisor reset is scoped to the shared synthetic demo/site. It restores golden workflow data and associated private evidence without exposing a general destructive reset function to browser roles.

When new demo-mutated tables are added, decide whether reset must restore/delete them and extend reset tests.

## 15. Agent change checklist

Before changing a flow:

1. Read the relevant section of [DATA_MAPPING.md](DATA_MAPPING.md).
2. Read involved definitions in [DATA_DICTIONARY.md](DATA_DICTIONARY.md).
3. Inspect the current page/action/service/integration code.
4. Inspect the owning migration/RPC.
5. Preserve organization + site authorization.
6. Preserve provider/event/media/AI idempotency.
7. Preserve append-only audit/history behavior.
8. Update database isolation tests for persistence or authorization changes.
9. Update these docs in the same PR when a data path changes.
