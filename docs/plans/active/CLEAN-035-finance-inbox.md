# CLEAN-035 Finance Inbox and expense approval

Issue #63. Branch `codex/clean-035-finance-inbox` from merged main `cef692c`.

## Acceptance plan

1. Persist app and normalized WhatsApp expense candidates with private source/receipt links and no cost effect.
2. Validate deterministic extraction, human site/category/amount/allocation resolution, and role boundaries.
3. Post once through Director approval with verified receipt, duplicate blocking and immutable provenance.
4. Add `finance-showcase` scenario adapter and source-backed totals without accounting/payment claims.
5. Pass database, unit, browser, scenario, typecheck, lint and build checks; submit one focused PR.

## Current state

Implementation and local acceptance checks are complete. Changed paths include the expense migration and pgTAP tests, inbox/receipt/review/approval actions and UI, the deterministic scenario adapter, browser and unit tests, and data/security docs.

- `npm run db:reset` and `npm run test:db`: 319 assertions passed on the local database.
- `npm run test`: 72 tests passed; `CI=1 npm run test:e2e`: 11 browser tests passed.
- `npm run test:scenario`, `npm run typecheck`, `npm run lint` and `npm run build`: passed.
- Local Supabase security and performance advisors at warning level: no issues found.

Next: submit the issue #63 PR for repository review. No hosted migration or production deployment has been performed.
