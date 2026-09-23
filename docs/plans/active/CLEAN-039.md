# CLEAN-039 — Trusted finance organization and site context

Issue #67. Work starts from `main` at `60efac2` on `codex/clean-039-finance-context`.

## Plan and acceptance

1. Resolve exactly one active membership in generic access context; derive organization and allowed sites from it.
2. Pass validated finance site context through `/finance`, actions, imports and message handoff; keep demo constants in demo-only code.
3. Prove second-organization access, guessed cross-organization IDs, revocation and import RPC denial with focused tests; run `typecheck`, `lint`, `test`, `build`, `test:db` and hosted demo checks.
4. Update canonical security/data-flow docs and submit one focused PR. Do not start contract/expense persistence until this context is verified.

## Changed paths

`src/services/access-context.ts`, `src/services/finance-context.ts`, finance page/actions and finance/message repositories; `tests/finance-context.test.ts`, `supabase/tests/finance_tenant_context_test.sql`, and relevant docs.

## Status

Implementation and local checks passed: `typecheck`, `lint`, 57 unit tests, 219 pgTAP tests,
`build`, and five authenticated browser tests after a fresh local synthetic database reset.
The Director `/finance` browser check exposed an unavailable PostgREST embed for composite task
foreign keys; repositories now use separately scoped queries, and the site-switch journey passes.
PR handoff pending. No production deployment performed.
