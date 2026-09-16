# CLEAN-004 — Store and resolve operational evidence

Status: implementation complete; GitHub Supabase CI pending. Dependency: CLEAN-003 merged in PR #12.

## Objective

Turn simulated image references into private, integrity-checked evidence that either resolves
deterministically to an authorized worker/task and revision or remains visible for supervisor
resolution.

## Scope

- Verified account-scoped worker identities and expiring conversation contexts.
- Private `operational-evidence` Storage bucket and authorized short-lived URL service.
- Size, declared type, detected file signature and source-reference validation.
- Staged upload, SHA-256 integrity, idempotent finalization and orphan reconciliation.
- Deterministic worker/assignment/site/zone/task and before/after resolution.
- Unresolved evidence reasons, audited manual remapping and submission revisions.

## Boundaries

Synthetic mock media only. No live provider download, AI analysis, quality approval, client
release, face recognition or public media URL. Timestamp proximity alone never pairs evidence.

## Acceptance checks

- Replay the 23:15 BEFORE and 23:29 AFTER into one Restroom B revision/pair.
- Keep unknown sender, stale/conflicting context, ambiguous task and after-first unresolved.
- Prove duplicate media, tenant/site reads, signed URL authorization and crash reconciliation.
- Run typecheck, lint, application tests, build, stock PostgreSQL checks and canonical Supabase
  reset/pgTAP CI. Move this plan to completed only after all checks pass.

## Implemented paths

- Migration/config/seed: `supabase/migrations/20260916061705_operational_evidence.sql`,
  `supabase/config.toml`, `supabase/seed.sql`.
- Media and access services: `src/services/evidence-*`, `src/integrations/evidence`,
  `src/app/api/demo/evidence`, `src/app/api/evidence`.
- Local replay/recovery: `scripts/replay-golden-evidence.mjs`,
  `scripts/run-ingress-worker.mjs --reconcile-evidence`.
- Verification: `tests/evidence-media.test.ts`, `tests/database/operational-evidence.sql`,
  `supabase/tests/operational_evidence_test.sql`, `scripts/test-evidence-storage.mjs`.

## Verification evidence

- Passed locally: typecheck, lint, 17 Vitest cases and production build.
- Passed locally: stock PostgreSQL migrations, golden pair, corrected revision, unresolved
  reasons, replay, supervisor audit, worker ownership and tenant/Storage isolation.
- Pending GitHub CI: local Supabase private-bucket API check and 32-case CLEAN-004 pgTAP suite;
  this machine has no Docker-compatible runtime.
- Browser journey check is not applicable: CLEAN-004 adds server routes and persistence only;
  the supervisor review interface starts in CLEAN-005.
