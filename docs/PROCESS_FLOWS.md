# CleanOps Process Flows

Purpose: implementation-aligned end-to-end flows for coding agents. Migrations, services and tests remain authoritative.

Last reviewed: 2026-09-21 against `main` at `e6aedc5`.

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
- Site grant establishes which site the user may access. Directors (`organization_administrator`) and `operations_manager` see every organization site without grant rows; supervisors, area managers, cleaners and client viewers need an active, time-bounded `member_site_access` row.
- Route access by role is defined in `src/config/navigation.ts` and each page guard: finance is Director (write) and Area Manager (read) only; cleaner mobile is cleaner and Director; the released client report is client viewer and Director.
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

**Currently unreachable from the UI.** The queue component and action exist but are not rendered since the
role-scoped finance rework (PR #43); the flow below is the data path when it is mounted again on `/finance` (issue #50).

```text
external_message_contexts
+ list_site_external_messages RPC
+ external_message_media
        |
        v
message queue UI (unmounted; formerly /finance)
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

Separately, `equipment_assets` (with `equipment_models`) is a read-only site register shown in the `/operations`
portfolio: status, condition and service dates come from seed data. A report names equipment only by free-text
label; there is no link to an asset, no inspection record and no repair cost, so repeat-fault history per machine
cannot yet be derived (issue #31).

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

Transaction types: receipt, issue, adjustment, count. Current ledger is append-only for browser roles (grants allow
select and insert only; Director update/delete is decided but not yet granted, issue #48). Only a Director can insert; a Director or a granted Area Manager can read a site's ledger.
An order is not consumption: `issue` records stock released to a site, not proof of use (issue #30).

## 12. Finance — labour

```text
site + work date + hours + hourly cost + type
+ optional worker
+ optional task run
  -> labor_cost_entries
  -> database total_cost = hours * hourly_cost
  -> labour ledger
```

Cost types: regular, overtime, contractor. This is operational cost capture, not payroll. Since CLEAN-020
(`20260921230000`), this ledger is readable by a Director only; an Area Manager sees the site's labour cost only as
the aggregate `direct_labour` figure in a `finance_reconciliations` row (§13), never a per-worker entry.

## 13. Reconciled finance import

```text
Director selects neutral CSV -> server preview (mapping + errors + warnings)
  -> Director chooses completeness and accepts
  -> hash + mapping-version dedupe
  -> immutable batch/source rows/allocations
  -> approved actual site-period totals persisted
  -> Director and granted Area Manager see contribution summary
```

Unknown sites and categories remain visible as unallocated warnings. A complete batch cannot contain unallocated, pending, rejected, estimated or committed rows. Incomplete and estimated batches retain those exceptions without counting them as approved actuals. A correction names the prior batch, marks its totals non-current and preserves both histories. Operational invoice/report references identify one imported source cost; they do not create a second expense.

## 14. Official WhatsApp outbound

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

## 15. Hosted demo reset

The supervisor reset is scoped to the shared synthetic demo/site. It restores golden workflow data and associated private evidence without exposing a general destructive reset function to browser roles.

When new demo-mutated tables are added, decide whether reset must restore/delete them and extend reset tests.
The reset function `reset_hosted_demo` (migration `20260916192408`, extended by `20260922031000`) is service-role
only. Message contexts and media are removed indirectly (they cascade from the deleted webhook events and messages).
It now also clears `inventory_transactions` and `labor_cost_entries` for the walkthrough site, so a Director's demo
finance entries no longer survive a reset. It deliberately does not touch `equipment_assets`: that table is seeded
fixture data with no application write path today (only `select` is granted to `authenticated`), so there is nothing
for a demo to mutate there — add reset coverage only once a write path exists. The review page's synthetic
preparation/correction helper (`submitSyntheticPair`) still depends on the local simulator flag, which production
forces off, so preparing the walkthrough on a production build is currently blocked (issue #25).

## 16. Agent change checklist

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
