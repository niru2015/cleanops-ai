# CLEAN-027 — Normalized message and finance workflow

Status: complete. GitHub issue: #41.

## Outcome

Give a supervisor a secure queue to confirm WhatsApp message area, task and sender, and a Finance &
Inventory screen for supplier/item setup plus inventory and labour records (Director-editable since
issue #48, with an audit trail).

## Acceptance

- Each normalized message receives receiving-account site context and media metadata automatically.
- Raw text remains unavailable through table grants; the supervisor queue requires active role and
  site authority.
- Media state mirrors evidence processing without public Storage access.
- Finance totals are generated in Postgres; source records remain immutable.
- Cross-site finance inserts and raw-message reads are denied by database tests.

## Verification

- `typecheck`, lint, 41 unit tests, build and the local PostgreSQL isolation suite passed.
- Hosted project `jfhpbabelqldhemrmvgc` has both migrations applied and `db push --dry-run` reports
  up to date.
- Browser access boundary was checked locally; a signed-in visual walkthrough awaits deployment.

## Status update (2026-09-21, after PR #43 and #44)

- Role-scoped finance (PR #43, migration `20260921051826_casino_demo_rbac_equipment`) replaced the acceptance rule
  "supervisors can insert finance records": ledgers are now readable by Directors and granted Area Managers only and
  writable by Directors only. Site supervisors no longer reach `/finance`.
- The message-context queue built here (`MessageContextQueue`, `getMessageWorkspace`, `performMessageResolution`)
  was re-mounted on `/finance`, scoped to the selected casino, by issue #50: Director and Area Manager can both
  confirm context (RLS `private.can_manage_site` already allowed it); Site Supervisor still cannot, since the route
  itself is Director/Area Manager only. Covered by `supabase/tests/message_context_review_test.sql`.
