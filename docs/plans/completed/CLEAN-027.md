# CLEAN-027 — Normalized message and finance workflow

Status: complete. GitHub issue: #41.

## Outcome

Give a supervisor a secure queue to confirm WhatsApp message area, task and sender, and a Finance &
Inventory screen for supplier/item setup plus append-only inventory and labour records.

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
