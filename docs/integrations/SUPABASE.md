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
