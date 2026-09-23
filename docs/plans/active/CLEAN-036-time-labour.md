# CLEAN-036 approved time and effective labour cost

Issue #64. Branch `codex/clean-036-time-labour` from merged main `88a4dae`.

## Acceptance plan

1. Add Director-only effective worker rates with overlap prevention and audited changes.
2. Derive idempotent shift time from attendance; missing/invalid endpoints remain exceptions. Support reviewed manual project time and explicit premium class.
3. Let operational reviewers approve hours, then let a Director post one confidential cost entry using the effective rate. Keep posted snapshots immutable.
4. Add time/rate screens and source-backed finance-showcase cases; Area Manager payloads omit individual rates.
5. Fix `/finance` partial availability when hosted finance import migrations lag and verify Director screen behavior.
6. Pass clean database, unit, scenario, browser, typecheck, lint, build and local advisor checks; submit one focused PR.

## Current state

Local implementation and verification are complete. `20260923165223_clean_036_time_and_labour_costing.sql` adds effective confidential rates, reviewed time, append-only audits, site RLS and idempotent Director posting. `/finance/time` and `/finance/rates` provide the operational and confidential surfaces. `/finance` keeps its available sections visible if newer accounting/time tables are missing. The `finance-showcase` adapter now replays six time cases, including an activated contract shift, and reconciles CAD 789.00 labour cost from source hours and rates.

Checks: clean local database reset; pgTAP 370/370; scenario generate/assert/reset; full 14-test authenticated Chromium suite for Director, Area Manager and Supervisor; `typecheck`, `lint`, 76 unit tests, `build`, and local `db lint --fail-on error` passed. The full suite exposed a fixture collision: the new Supervisor login initially displaced the seeded supervisor used by existing incident and review demos. The browser fixture now provisions a separate site-scoped membership, and both previously failing journeys pass. The local lint reported two pre-existing warnings in `fail_processing_job` and `fail_whatsapp_reply`. Browser checks used local synthetic logins; the hosted app was only observed signed out. A later E2E run changes local seed memberships, so reset before repeating pgTAP.

Hosted database release (2026-09-23): with explicit user authorization, `npx supabase db push --linked --project-ref jfhpbabelqldhemrmvgc --skip-vault --yes` applied the eight pending migrations in order, ending at `20260923165223`. No seed or role files were pushed. The remote migration ledger independently lists all eight; a subsequent dry run reports up to date. Read-only queries confirmed the reconciliation, contract, expense, time and rate tables, enabled RLS on the new finance tables, private contract and receipt buckets, and no change to the empty labour and inventory ledgers. Remote `db lint --schema public --fail-on error` passed with the same two pre-existing warnings in `fail_processing_job` and `fail_whatsapp_reply`. The project reports `ACTIVE_HEALTHY`, and the hosted root and `/finance` routes return HTTP 200. The app has no `/api/health` route. No authenticated hosted Director browser check was possible from the signed-out session.

Next: obtain required PR review, merge #73 and verify the resulting production deployment and authenticated Director finance journey. The migration release did not merge or deploy the application code.
