# 008 — Real casino names in the demo, public repository, supply approvers

Status: accepted, owner decision. Date: 2026-09-21. GitHub issue #51.

## Context

The hosted BC casino role demo uses real casino and commercial-equipment names as reference data. AGENTS.md
required synthetic sites only, and README described the repository as private; it is public.

## Decision

1. Real casino and commercial-equipment names may be used in the hosted demo as reference/demo data. This is an
   explicit exception to the "synthetic sites" rule; no customer or service relationship is implied.
2. The repository stays public.
3. Supply requests (issue #30) are approved by Area Managers, Operations Managers and Directors. Supervisors
   request but do not approve. Area Manager finance access is read-only, so approval is its own permission.

## Constraints that remain

- No real staff, patron, customer or surveillance data; personnel names are demo display identities.
- No claim of a real deployment, customer relationship or measured performance.
- Demo credentials, secrets and provider keys are never committed; the shared demo password is rotated.
- The hosted casino data is not in `supabase/seed.sql`; it must become reproducible from the repository (issue #28).

## Alternatives and rationale

Renaming to fictional venues avoids any implied association, but the owner prefers realistic names for the
demonstration. The constraints above keep the exception bounded.

## Consequences

Issue #28 drops its "no real casino names" test; issue #38 replaces "no real casino/staff data" with the constraints
above. Anything published in a public repository is visible to everyone, so review demo data before committing it.

## Revisit when

A casino or equipment vendor objects, a real customer engagement starts, or real staff data is introduced.
