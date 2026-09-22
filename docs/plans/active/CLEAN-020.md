# CLEAN-020 active plan

Issue: #33 — Import reconciled site and job revenue/cost data.

## Scope

- Add neutral CSV import batches, immutable source rows, mapping/version provenance and site/job allocations.
- Preview validation and unallocated/incomplete rows before Director acceptance.
- Make accepted imports idempotent, auditable and correctable through superseding/reversal records.
- Persist reconciliation totals and direct-contribution metrics without calling them net profit.
- Keep imports Director-only and site financial results visible only to Directors and granted Area Managers.
- Add the synthetic August control totals and a Sage source-readiness checklist.

## Acceptance checks

- August fixture reconciles to CAD 350,000 revenue, CAD 290,000 direct cost and CAD 60,000 direct contribution.
- Reimport is idempotent; correction retains source history and revises totals.
- Missing/unmapped/currency/partial-period conditions remain visible and do not present a misleading margin.
- Site/job allocations balance, including rounding and negative/reversal rows.
- Database tests cover tenant/site/role isolation and client/payroll denial.
- Typecheck, lint, unit tests, build, database tests and finance browser checks pass or are reported with exact blockers.

## Status

Implemented on `codex/clean-020-finance-import`. Typecheck, lint, 49 unit tests, production build and 181 database tests pass. Browser sign-in reached the local app but the local SSR session cookie was not retained after redirect, so Director/Area Manager browser assertions remain blocked by the local auth harness.
