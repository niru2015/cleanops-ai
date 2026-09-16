# 007 — Capped OpenAI visual quality suggestions

Status: accepted. Date: 2026-09-16.

## Decision

Keep the deterministic mock as the default. Permit an optional Responses API adapter only after a
tenant has enabled a finite budget. Accept redacted minimal derivatives and criterion IDs, validate
strict structured output server-side, and leave every approval to a human supervisor.

## Alternatives and rationale

An uncapped provider call or client-side adapter could expose cost, media or credentials. Treating
JSON as trustworthy could allow malformed or stale content to influence a review decision.

## Consequences

The database owns the two-attempt cap, tenant cache and conservative charge. Missing budget or
credentials, refusal, incomplete/invalid output and stale revision produce manual review. Billing
may remain an upper-bound estimate until provider invoices are reconciled.

## Revisit when

The pilot owner approves real-media authorization, retention/region controls, a derivative pipeline
and a reviewed synthetic evaluation threshold.
