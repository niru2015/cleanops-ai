# 001 — Supabase as initial data platform

Status: accepted design baseline, implementation pending. Date: 2026-09-14.

## Decision

Use Supabase Postgres, Auth and private Storage with migrations as SQL truth.

## Alternatives and rationale

Separate database/auth/storage vendors increase setup and integration work.

## Consequences

Tenant isolation requires explicit grants, policies and tests; local persistence is required even in demos.

## Revisit when

A measured platform limitation or validated customer residency requirement.
