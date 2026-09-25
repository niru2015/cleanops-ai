# CLEAN-017 supply workflow — active plan

Issue: #30. Branch: `codex/supply-requests-stock-history` from current `main`.

## Scope and decisions

- Reuse `inventory_items` and `inventory_transactions`. A request, approval, order or stock issue is not itself a supplier expense.
- Supervisor submits an assigned-site request; Area Manager, Operations Manager or Director decides it. Quantity or item changes after approval require a new review event and state.
- Store pack-to-base-unit conversion and price provenance on each request item. Permit partial receipts. Refuse negative stock; a count records an audited adjustment rather than overwriting history.
- Link a supplier expense posting to a receipt explicitly and at most once. Accounting reconciliation continues to use the existing finance source path.
- Keep implementation on its own PR against `main`; the concurrent UI preview branch owns restyling.

## Checks before completion

- Migration and database tests: role/site access, idempotent request/receipt, approvals, changed request, partial receipt, stock arithmetic, transfer/count, no negative stock and finance double-count boundary.
- Application: typecheck, lint, tests, build, and Supervisor/manager browser journeys.
- Update DATA_DICTIONARY, DATA_MAPPING and PROCESS_FLOWS with the actual persisted path.

## Current verification and follow-up

- Disposable PostgreSQL migration/RLS suite passes, including the CAD420 request and 24 + 12 - 10 = 26 stock control. Typecheck, lint, 89 unit tests and production build pass.
- Isolated local Playwright sign-in verified Director request, approval, order and partial receipt; the stock view rose by the received amount. Supervisor could view and submit for the assigned site without approval, comparison or finance controls.
- The existing #28 scenario schema explicitly rejects `modules.supplies`, so this PR does not turn that flag on or alter the hosted `finance-showcase` registry/reset contract. A separate #28 adapter must add one normal request, one high request, one partial receipt and one idempotent retry with manifest/reset assertions before #30's scenario acceptance is complete.
- The official WhatsApp adapter does not yet feed reviewed supply drafts. The form request key is idempotent; `source_message_id` is reserved for the canonical #27 intake bridge.
- The legacy `reset_hosted_demo()` deletes inventory rows for the walkthrough site. After a supply receipt or movement there, the new append-only stock trigger correctly refuses that deletion, so the reset requires a separately reviewed exact-scope maintenance change before this workflow can be exercised on that hosted walkthrough site. The two-session retry suite uses the other synthetic site and passes without weakening immutability.
