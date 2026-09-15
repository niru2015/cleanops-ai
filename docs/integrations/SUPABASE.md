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
migration or infrastructure creation is part of Phase 0.

Sources checked 2026-09-14: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
The [changelog](https://supabase.com/changelog) must be checked again during implementation;
its Markdown endpoint could not be retrieved in this documentation pass.
