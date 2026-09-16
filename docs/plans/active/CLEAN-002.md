# CLEAN-002 — Tenant, auth, site and work foundation

Status: implementation complete; canonical Supabase CI pending. Dependency: CLEAN-001 draft PR #10.

## Objective

Create the smallest persistent local domain foundation for a secure synthetic one-site demo,
while proving organization and site isolation at the database boundary.

## Scope

- Local Supabase config, pinned CLI/client packages, migration and deterministic seed.
- Organizations, memberships, site grants, clients, sites, zones and workers.
- Worker permissions, tasks, schedules/runs, shifts, assignments and attendance.
- Explicit grants, private authorization helpers, RLS and composite tenant/site constraints.
- Cookie-bound browser/server clients with validated public configuration.
- pgTAP suite plus a stock-Postgres compatibility harness for this Docker-free machine.

## Verification state

- Migration, seed and RLS compatibility suite: passed on PostgreSQL 18.
- Supabase CLI command discovery: passed with pinned CLI 2.117.0.
- Canonical `supabase db reset` and `supabase test db`: delegated to GitHub Actions because
  this machine has no Docker-compatible runtime.
- Application typecheck, lint, tests and build: passed with a clean `npm ci` install.

## Boundaries and next step

No remote Supabase project is linked or modified. Raw messages, Storage, AI, live integrations
and deployment remain out of scope. Publish a stacked draft PR for issue #2, confirm the
canonical Supabase CI job, and then move this plan to completed.
