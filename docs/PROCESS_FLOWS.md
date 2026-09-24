# CleanOps Process Flows

Purpose: implementation-aligned end-to-end flows for coding agents. Migrations, services and tests remain authoritative.

Last updated: 2026-09-24 for CLEAN-012 hosted fixture guard.

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
- BEFORE must precede the initial AFTER. A correction can append only a new AFTER and reuse the original BEFORE in a new pair revision.
- Authenticated `submitted_by_user_id` is recorded separately from attributed `worker_id`; the submitting supervisor cannot approve the same revision.
- The selected task ID is checked against the demo worker assignment and source thread at preparation and finalization. Review obtains short-lived image URLs only after signed-in evidence authorization.
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

## 5. Director/Area Manager message context review

Fixed (issue #50): re-mounted on `/finance`, scoped to the selected casino, for Director and Area Manager (not
Site Supervisor — the route itself is Director/Area Manager only since PR #43's role-scoped finance rework).

```text
external_message_contexts
+ list_site_external_messages RPC
+ external_message_media
        |
        v
/finance message queue
        |
        v
Director or Area Manager confirms area/task/sender role/worker
        |
        v
external_message_contexts resolution_status=confirmed
```

Receiving-account site is a deterministic suggestion; the confirming Director/Area Manager sets the finer context.

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
Supabase Auth user -> active membership lookup (exactly one)
  -> trusted organizationId + role -> allowed site set
  -> validate selected site -> finance/message repositories and actions
  -> RLS/RPC checks + composite organization/site foreign keys
```

No finance form or import payload chooses a trusted organization. Multiple active memberships
fail closed until an explicit validated organization selector exists.

```text
create supplier -> vendors
create item     -> inventory_items

vendor + item + site + quantity + unit cost
  -> inventory_transactions
  -> database total_cost = quantity * unit_cost
  -> inventory ledger
```

Transaction types: receipt, issue, adjustment, count. A Director can insert, edit and delete rows (issue #48); a
granted Area Manager can read but not write. Every edit/delete is recorded in `finance_ledger_audit_events` with the
actor, before/after state and action; a trigger rejects reassigning `organization_id`, `site_id` or `id`.
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
(`20260921230000`), this ledger is readable and writable by a Director only (issue #48 added edit/delete on top of
the existing insert); an Area Manager sees the site's labour cost only as the aggregate `direct_labour` figure in a
`finance_reconciliations` row (§13), never a per-worker entry.

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
for a demo to mutate there — add reset coverage only once a write path exists. In production mode, review
preparation/correction uses an authenticated server-only fixture command. It verifies the actor's active role and
grant to the exact synthetic site, limits the task and event IDs, and passes labelled images through durable ingress
and evidence services. A site-level operation lease prevents simultaneous preparation/correction/reset; start and
outcome are stored in `hosted_demo_fixture_audit`. Reset may restore the two enumerated synthetic task runs from
approved to ready; approved submissions outside that scope remain final. Storage cleanup receives only paths returned
by the site-scoped database reset, and the UI reports a partial reset if object deletion fails.

## 16. Contract draft and activation (CLEAN-022)

Manual create resolves organization/client from the selected authorized site in `create_manual_contract`, then saves a draft version. The wizard persists dates, billing terms, staffing, obligations, SLA rules and responsibility flags as normalized draft rows. An assigned Area Manager or Director can resolve an existing draft obligation's same-site zone without replacing its source-linked row; the update appends an actor-stamped contract event. Operations Managers can review operational terms only. Submission records an event. Director approval checks dates, priced terms and obligation zones, stamps the actor/time, and freezes browser edits.

`preview_contract_activation` counts the approved version's tasks/schedules, first 28 effective days of staffing coverage, SLA definitions and up to 12 fixed-fee billing periods. Its token identifies the frozen approved version. `activate_contract_version` checks that token, locks the contract/version, shortens an overlapping prior active version's future window, marks replaced future revenue expectations non-current, and atomically creates version-linked service tasks, schedules, shifts/coverage, expected revenue and SLA definitions. Quarterly work is one schedule with quarterly recurrence. A retry against the already active version fails without duplicate rows. Existing task runs and prior-period expectations are preserved.

`contract_revenue_expectations` represent expected billing only. CLEAN-020 imported accounting rows remain distinct recognized actuals; #66 will reconcile them. Task runs created from a contract schedule inherit its version ID; an amendment leaves existing task-run provenance and requirements snapshots unchanged. The scenario factory's contracts adapter builds synthetic source terms and replays approval/activation through the same RPCs, then queries current expectations against the generated manifest. Its local reset refuses other attached operational records before deleting scenario-owned contract rows.

## 17. Contract document source and review (CLEAN-034)

Director or granted Area Manager selects a draft and stages PDF/DOCX/image metadata. A 15-minute scoped ticket and signed Storage token allow direct private upload. Finalization reads the object server-side, validates its bytes against the prepared size/type/hash, counts bounded pages and deduplicates the same hash within that version. A changed amendment uses CLEAN-022's new draft version and leaves the historical active version intact.

Extraction reads native PDF/DOCX text first, runs bounded English OCR only on image or scanned PDF pages, then the deterministic provider proposes terms. Zod validates the structured result, and the service verifies every cited span against the extracted page text before storing it. Absent/ambiguous terms remain `not_found` or `review_recommended`; no model confidence is presented as legal certainty. A provider failure creates a failed run without changing the draft.

The review screen shows the source span and machine proposal separately. Accept/edit/reject/unknown invokes `review_contract_extraction_proposal`, which writes a human decision and any supported canonical draft value transactionally. Operations Managers may review only operational snippets and do not apply canonical rows. Director approval is blocked while any matched proposal remains undecided; CLEAN-022 still checks canonical effective dates, priced terms and obligation zones. Extraction and review never activate a version. Original files remain private, including after amendment supersession.

## 18. Finance Inbox to approved direct cost (CLEAN-035)

1. An assigned-site app user submits text through `submit_app_finance_intake`, or durable normalized WhatsApp ingress creates a keyword-classified candidate. Both retain the original source and have zero cost effect. Evidence-linked media is recorded separately.
2. An app receipt is uploaded directly into the private bucket under a scoped ticket. Finalization reloads and verifies bytes/MIME/size/hash. A source document remains linked to its intake; failed or missing media stays visible for review.
3. Deterministic text/OCR parsing stores a validated proposal with provenance. It never changes canonical claim values. A Director or granted Area Manager checks source, site, category, vendor, date, payment method, amount and allocation, then calls the resolution RPC. Corrections/rejection are audited.
4. Only the Director posts a submitted claim. The approval transaction locks the claim, verifies the receipt and totals, serializes by organization plus receipt hash, and creates one immutable posting per balanced allocation. A retry returns the posted claim; another source with the same receipt hash is rejected.
5. The expense view drills back to the source and receipt. Employee-paid status does not create a payment. An equipment purchase is marked for later asset review. Posted non-capital expense may be linked to accepted accounting in CLEAN-038.

## 19. Approved time to confidential labour cost (CLEAN-036)

1. A site operational reviewer derives one time entry from a shift assignment's persisted attendance. Missing checkout, missing check-in, invalid order, over-24-hour span or cancelled assignment becomes an exception. The source fingerprint makes unchanged derivation idempotent. A changed source refreshes only an unposted entry and appends audit.
2. The same reviewer may create a manual project draft for an active site worker with a source reason. In either path, review records the actual approved hours, explicit cost class and reason; approval alone does not write a cost.
3. A Director maintains effective CAD worker cost rates. New intervals close or supersede the old active interval and append rate audit. Overlap is blocked by a database exclusion constraint.
4. A Director posts an approved time entry. The RPC locks the entry, requires exactly one effective rate on its site-local work date, writes a Director-only `labor_cost_entries` snapshot and links it back to the time entry in one transaction. Retry returns the same ledger ID. Linked posted cost and audit rows are immutable.
5. `/finance/time` gives managers operational hours and exceptions without rate payloads. `/finance/rates` is Director-only. Direct ledger rows in `/finance` remain separately labelled adjustments. CLEAN-038 reconciles posted approved cost to accounting periods.

## 20. Accounting match and period close (CLEAN-038)

1. A Director opens an organization-wide calendar month. Accepted accounting batches must cover the whole month; incomplete, estimated or missing coverage blocks close.
2. Posted expenses, labour and inventory issues are compared to accepted, approved, actual direct-cost allocations at the same organization, site, project, category and currency. Exact source IDs, document references, then amount/date/context yield deterministic proposals. Reciprocal or multiple best proposals stay ambiguous. The Director can run unique proposals or enter an explained manual amount. A link never creates a new cost.
3. Each link consumes remaining source and operational balance. Partial allocation and split matching remain visible until both sides balance. Invalid sources, invalid links, unmatched amounts and ambiguity block close. Area Managers see only their site's aggregate counts and amounts.
4. A Director moves the period to review and closes only after the database recomputes full-month coverage and all balances. Close freezes a versioned metric snapshot. Correction requires a reasoned reopen; link voids and new matches are audited. A late accepted import or changed operational amount marks the closed snapshot stale for review.
5. The finance-showcase scenario generates one unique exact match, two ambiguous duplicate-source proposals, an unmatched source, a closed July month and a late July import that makes its snapshot stale. The local reset deletes only that scenario's period, match and import records.

## 21. Agent change checklist

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
# CLEAN-037 one-off project contribution

An assigned Area Manager or Director creates and edits a site-bound project draft, optionally under a contract. Only a Director approves fixed/hourly terms, activates or cancels the project. Operational time is assigned to the project before cost posting; approved hours become a confidential labour cost snapshot. A Director may link an existing posted expense, inventory issue or accounting allocation without editing the original immutable source. Equipment purchases are excluded from direct expense cost pending asset treatment. Director-approved billable hours drive hourly expected revenue; recorded invoices do not imply accounting recognition. Accepted, approved, actual revenue allocations drive recognized revenue. The register shows recognized, unresolved and incomplete accounting-source counts. The Director closes costs only after review; recognized contribution remains pending until accounting completeness is also confirmed. The site finance overview retains its original ledger totals and does not add project subtotals again.
## Hosted synthetic finance scenario release

Protected operator tooling builds #28's deterministic `finance-showcase` plan, verifies the
explicit hosted project and dedicated scenario organization IDs, and performs a read-only
collision preflight. After separate approval for the hosted data write, it persists a service-only
`demo_scenario_runs` registry before inserting source records. Domain replay uses generated
scenario personas through authenticated RPCs for consequential finance actions. The registry is
updated as IDs are created and marked `ready` only after source-backed assertions pass; failures
remain `partial`. A reset reads the database registry, verifies all organization-scoped source
IDs and absence of unrelated rows, then deletes only that synthetic organization in dependency
order. Hosted reset requires the exact project database connection and never runs from a browser.
