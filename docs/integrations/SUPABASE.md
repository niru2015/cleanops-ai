# Supabase integration

Local Supabase is the initial persistence environment; separate demo/staging/production
projects when deployed. Never reuse another product's database or credentials.
Use session-bound clients for user actions and narrowly isolated privileged workers.
Browser receives only project URL and publishable key. Secrets never use NEXT_PUBLIC_.

Migrations define schema, minimal grants and RLS together. Seed synthetic organizations,
users, site grants and work fixtures; do not seed real phone numbers or customer data.
Policies use trusted membership/site relations. Views must preserve caller authorization;
privileged functions require explicit scope checks and restricted execution.
Private Storage policies follow record ownership; object path prefixes are not authorization.
Realtime is optional and must use the same visibility boundaries.

P1 acceptance: reproducible local reset/seed, authenticated allowed cases, tenant/site denied
cases and revocation tests. P2 adds raw events/jobs/evidence and private-media access tests.
Use supported CLI commands verified through installed help; record versions. No remote
migration or infrastructure creation is part of CLEAN-002.

Sources rechecked 2026-09-15: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[local development](https://supabase.com/docs/guides/local-development),
[server-side Auth](https://supabase.com/docs/guides/auth/server-side) and
[changelog](https://supabase.com/changelog).

## CLEAN-002 implementation

- CLI `2.117.0`, `@supabase/supabase-js` `2.116.0` and `@supabase/ssr` `0.12.7`
  are pinned in the lockfile.
- `supabase/config.toml` opts out of automatic Data API exposure; the migration supplies
  explicit grants and RLS for every exposed table.
- `supabase/seed.sql` contains fixed UUIDs, reserved `.example` emails and synthetic demo names.
- `supabase/tests/rls_boundaries_test.sql` is the canonical pgTAP suite.
- `npm run test:db:postgres` provides a local policy compatibility check without Supabase
  services. It does not replace `npm run db:reset` and `npm run test:db` before merge.
- Server utilities use cookie-bound `@supabase/ssr` clients and `getClaims()` for verified
  identity. Authorization stays in RLS and never uses editable user metadata.

Changelog rechecked 2026-09-15. Relevant current changes: public tables are moving to
explicit Data API opt-in, Postgres 14 support has ended, and Node.js 20 client support is
ending. CLEAN-002 uses explicit grants, targets Supabase Postgres 17, verifies policy
compatibility on PostgreSQL 18 and runs application checks on Node.js 24.

## CLEAN-003 implementation

- Migration `20260916053638_durable_mock_ingestion.sql` defines four RLS-enabled tables and
  service-role-only functions for atomic acceptance, leased claim, completion, failure and retry.
- `accept_mock_ingress_event` derives the tenant from the registered account and stores the raw
  envelope and pending job in one transaction. Unique constraints make retries idempotent.
- `claim_processing_job` uses row locking with skip-locked selection and reclaims expired leases.
- `supabase/tests/durable_ingestion_test.sql` is the canonical pgTAP suite; the stock PostgreSQL
  compatibility suite also executes two simultaneous acceptance transactions.
- CLEAN-003 remains local-only and does not link or deploy a remote Supabase project.

## CLEAN-004 implementation

- `supabase/config.toml` declares a private `operational-evidence` bucket with a 10 MiB limit and
  JPEG, PNG and WebP allowlist.
- Migration `20260916061705_operational_evidence.sql` defines tenant/site constraints, RLS,
  service-only staging/finalization and authenticated audited resolution.
- Storage object reads require a visible ready evidence row. The application issues a short-lived
  URL only after a cookie-bound client passes that policy.
- Database tests cover the golden pair, corrected revision, duplicate media, unresolved reasons,
  supervisor remapping, worker ownership and cross-tenant Storage denial.
- Files are uploaded and downloaded through the Storage API; SQL manages authorization metadata
  and policies rather than object contents.

Storage guidance rechecked 2026-09-15: [access control](https://supabase.com/docs/guides/storage/security/access-control),
[private asset serving](https://supabase.com/docs/guides/storage/serving/downloads) and
[schema boundary](https://supabase.com/docs/guides/storage/schema/design).

## CLEAN-007 implementation

- Migration `20260916161009_incident_equipment_reporting.sql` defines eleven RLS-enabled tables,
  six explicitly granted RPCs and no anonymous table/function access.
- Supervisor mutations resolve membership and site authority inside security-definer functions;
  service-role demo calls must supply an authorized synthetic actor.
- The client export resolves an active `client_viewer` plus site grant and returns released safe
  fields only. Drafts, statements, evidence links, equipment originals and audit rows remain denied.
- Changelog rechecked 2026-09-16. The current explicit Data API grant requirement is preserved;
  unrelated Management API, Realtime and self-hosting breaking changes do not affect this slice.

## CLEAN-027 implementation

- Migration `20260921002737_normalized_message_finance_records` adds message context/media metadata,
  vendors, inventory items/transactions and labour cost entries.
- All six tables have RLS enabled and are granted only to `service_role` while supervisor-facing
  workflows are being designed.
- Composite tenant/site/task/worker foreign keys prevent cross-organization references; generated
  total-cost columns derive inventory and labour totals from quantity/hours and unit rates.
