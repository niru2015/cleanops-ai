# 005 — Persisted jobs and idempotent effects

Status: accepted design baseline, implementation pending. Date: 2026-09-14.

## Decision

Persist verified ingress and a processing job atomically before acknowledgement; use leased workers and stage-level dedupe.

## Alternatives and rationale

In-request AI/media processing and untracked background promises do not survive failures reliably.

## Consequences

Implement retries, leases and reconciliation; choose production runner before live pilot.

## Revisit when

Throughput or operational measurements justify a managed queue.
