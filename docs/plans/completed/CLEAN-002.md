# CLEAN-002 — Tenant, auth, site and work foundation

Status: implemented and verified on 2026-09-15; draft PR pending review.

Implementation revision: `3b03e2dfff90d45a6242510ceb9ce6d56c3c9931`.
Review: [GitHub pull request #11](https://github.com/niru2015/cleanops-ai/pull/11).
CI: [successful application and database run](https://github.com/niru2015/cleanops-ai/actions/runs/35058063573).

## Outcome

- Added pinned local Supabase configuration, a reproducible migration and deterministic seed.
- Added organizations, memberships, clients, sites, site grants, zones and workers.
- Added worker permissions, service tasks, schedules/runs, shifts, assignments and attendance.
- Added minimal grants, private authorization helpers, RLS and composite tenant/site keys.
- Added cookie-bound browser/server clients and verified-claims server auth utilities.
- Added pgTAP coverage and a stock-PostgreSQL compatibility harness.
- Documented statement-level membership revocation and the local-only workflow.

## Verification

- `npm ci` — passed from the committed lockfile.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `npm test` — passed, 4 tests.
- `npm run build` — passed; `/` prerendered as static content.
- `npm run test:db:postgres` — migration, seed and RLS checks passed on PostgreSQL 18.
- `npm run db:reset` — passed in GitHub Actions against Supabase Postgres 17.
- `npm run test:db` — passed all 16 pgTAP assertions in GitHub Actions.

## Boundaries and next step

All fixtures are synthetic and use reserved `.example` identities. No remote Supabase project,
Storage, raw message ingestion, AI, live integration or deployment was created. CLEAN-003 is
next: durable mock ingress with idempotency and restart checks.
