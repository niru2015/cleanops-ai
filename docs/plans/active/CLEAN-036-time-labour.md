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

Next: review/merge the PR, then schedule the already-pending hosted migration chain and deployment as a separate approved release. The linked hosted database is eight migrations behind this branch's base (through `20260921070701`), so the hosted Director finance screen cannot be fully repaired by the code PR alone. No hosted migration or deployment has been applied.
