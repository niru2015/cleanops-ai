# 004 — Contractor tenant with explicit site grants

Status: accepted design baseline, implementation pending. Date: 2026-09-14.

## Decision

Organization is the contractor. Enforce tenant and site access in database and service boundaries from P1.

## Alternatives and rationale

Single-tenant demo shortcuts conceal isolation failures and cause later migration work.

## Consequences

Use two tenants and restricted same-tenant sites in tests even when UI demos one site.

## Revisit when

Validated requirement for separately isolated customer databases.
