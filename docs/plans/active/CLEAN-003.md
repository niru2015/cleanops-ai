# CLEAN-003 — Durable mock message ingestion

Status: implementation complete; GitHub CI pending. Dependency: CLEAN-002 merged in PR #11.

## Objective

Persist authorized synthetic inbound envelopes and pending processing jobs before acknowledging
them, then normalize each message exactly once through a reclaimable leased worker.

## Scope

- Authorized demo-only batch route with strict payload limits and validation.
- Account-scoped envelopes, normalized messages and bounded processing jobs.
- Atomic envelope/job acceptance, idempotency and tenant derivation from registered accounts.
- Worker claim, completion, persisted retry, expired-lease recovery and manual failed retry.
- Database and service tests for duplicate, concurrent, mixed-account and restart cases.

## Boundaries

No media fetching or Storage, sender identity mapping, task pairing, AI, outbound messages,
live WhatsApp endpoint or production runner. Payloads and error codes remain synthetic and
logs must not repeat message content.

## Verification plan

Run the PostgreSQL compatibility suite, canonical Supabase reset/pgTAP CI, application
typecheck, lint, tests and build. Record exact outcomes before moving this plan to completed.

## Implemented paths

- Migration/seed: `supabase/migrations/20260916053638_durable_mock_ingestion.sql`,
  `supabase/seed.sql`.
- HTTP and worker: `src/app/api/demo/messages`, `src/services`,
  `src/integrations/mock-whatsapp`, `scripts/run-ingress-worker.mjs`.
- Verification: `tests/durable-ingestion.test.ts`, `tests/database`,
  `supabase/tests/durable_ingestion_test.sql`.

## Verification evidence

- Passed locally: typecheck, lint, 10 Vitest cases, production build.
- Passed locally: stock PostgreSQL migrations, tenant/access checks, two-client concurrent
  acceptance, duplicate effects, expired-lease recovery and manual retry.
- Pending GitHub CI: canonical Supabase reset and 23-case CLEAN-003 pgTAP suite because this
  machine has no Docker-compatible runtime.
