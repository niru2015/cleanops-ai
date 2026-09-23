# CLEAN-022 contract foundation

Issue #35. Branch `codex/clean-022-contract-foundation` from merged `main` at `2520546`.

## Acceptance plan

1. Add normalized tenant/site-scoped contract, version, financial, obligation, staffing and expected-revenue records with role-specific RLS and immutable approved terms.
2. Add Director approval and transactional activation with exact preview, idempotent downstream provenance and future amendment handling.
3. Build a persisted manual wizard, register and review/activation routes. Area Managers can draft assigned sites; Operations Managers get operational-only review; Directors can approve and activate.
4. Add scenario-factory contract builder and expected-manifest contribution after #28 Stage A (now merged).
5. Verify SQL/RLS, service arithmetic, browser role journeys, `typecheck`, `lint`, `test`, `build`, and local database isolation.

## Current state

Local implementation and acceptance checks are complete. `typecheck`, `lint`, `test` (65 tests), `build`, clean `db:reset` + `test:db` (263 pgTAP tests), `test:scenario` (including partial contract recovery), `test:contract-concurrency`, three contract Chromium journeys and local Supabase security advisors passed. The four-site finance showcase generated, reconciled expected revenue, and reset locally. PR review/remote CI and any hosted migration remain pending; no production database deployment has been performed.
