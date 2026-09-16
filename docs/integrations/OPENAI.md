# OpenAI integration

Use a server-only provider adapter with a deterministic mock implementing the same service
contract. Live model ID is configuration, selected using an evaluation set at P4; no frozen
pricing or “latest model” assumption in this pack. No key or paid call is needed for P0–P3.

Use the Responses API with a supported structured-output model at implementation time.
Validate returned structure and domain IDs server-side. Handle refusal, incomplete output,
transport error and timeout explicitly; valid JSON alone does not prove factual accuracy.
Keep retry/cost logic centralized in the job layer so SDK retries cannot multiply attempts.

Inputs: approved minimum image derivatives and relevant criteria. Outputs: suggestion only;
no direct database actions, messaging tools, user assignment or client publication.
Use application correlation IDs without private message text; record provider request IDs
and actual returned usage where available. Unknown billing on timed-out calls remains unknown.

Before real media: verify provider data handling, retention settings, regional requirements
and customer authorization. Do not assume zero retention. Test mock failure and refusal paths
before live integration, then run a small capped fixture evaluation and record results.

Source checked 2026-09-14: [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
Use current official API documentation to verify model support and request fields at P4.

## CLEAN-008 implementation

`OPENAI_QUALITY_LIVE_ENABLED=true` is necessary but insufficient: a server-only API key and a
positive `OPENAI_QUALITY_ATTEMPT_CENTS` are also required. Tenant `quality_ai_budgets` must have
an enabled finite ceiling. The Responses request uses `store: false`, a strict JSON Schema and a
1,000-token output ceiling. The adapter applies a 30-second abort signal and never retries inside
the SDK; the database reservation is the only retry counter.

Provider output, response correlation, latency, returned usage and the conservative cap charge
are stored in private `quality_ai_runs`. `quality_ai_evaluations` records the synthetic fixture,
mismatch, abstention, reviewer override and cost provenance. The mock is still the default demo
service. Real media remains blocked until an approved derivative/redaction pipeline exists.
