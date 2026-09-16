# CLEAN-008 — Capped OpenAI quality analysis

Status: implemented and verified locally. Implementation revision: pending review.

## Delivered

- Server-only Responses API adapter with `store: false`, strict `quality.v1` JSON Schema, a
  30-second abort, a 1,000-token output ceiling and Zod validation.
- Provider receives only two approved redacted derivatives and criterion IDs; the server attaches
  trusted evidence IDs after validation.
- Tenant records reserve a configured cap before a call, allow no more than two attempts for a
  cache key and conservatively charge the cap when final billing is unknown.
- Refusal, incomplete, invalid, stale, disabled or budget-exhausted paths remain manual review.
- Synthetic fixtures cover clean, visible streak, blur, missing-before, unrelated pair, sensitive
  image and malicious embedded instruction; evaluation records retain mismatch, abstention,
  reviewer override and cost provenance.

## Verification evidence

- Passed locally: lint, strict TypeScript, 31 Vitest tests, production build and stock PostgreSQL
  migrations, RLS, cache, retry-cap, budget and evaluation-provenance checks.
- No paid provider call, remote Supabase migration or production deployment was performed. Live
  evaluation stays blocked until a tenant budget and approved redacted derivatives exist in a
  persistent environment.
