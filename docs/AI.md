# AI contract and cost controls

AI is decision support. It never certifies cleanliness, assigns blame, changes eligibility,
disciplines a worker, dispatches a replacement or publishes a client report autonomously.
All quality approvals are human in the initial MVP, regardless of model confidence.

## Services

| Service | Input → output | Phase / fallback |
|---|---|---|
| EvidencePairingService | validated context/candidates → proposed task and role | P2 deterministic; ambiguity → reviewer |
| VisualQualityService | approved image derivatives + criterion IDs → observations | P2 mock; P4 vision; failure → reviewer |
| IncidentCopilotService | attributed statement + permitted evidence → draft fields | P3 mock; human confirms facts |
| ContractExtractionService | authorized contract → requirements with source spans | Later; manual entry |
| KnowledgeAssistantService | tenant/site-scoped SOP excerpts → cited answer | Later; abstain without source |
| ReplacementRecommendationService | eligible candidates and coverage → ranked suggestions | Later; deterministic filter, human assignment |
| OperationsInsightService | aggregated validated metrics → explanatory draft | Later; retain computed metrics |

## Initial visual result schema

Version `quality.v1`: decision_id; task_run_id; submission_revision; status enum
`assessed|insufficient_evidence`; score nullable number 0–100; confidence nullable number
0–1; findings array of {criterion_id, observation, severity: low|medium|high,
evidence_ids[]}; limitations[]. Unknown IDs, extra keys and invalid ranges are rejected.
Server attaches trusted IDs/version; model cannot choose a different tenant or task.
Score is advisory. An insufficient result has null score and enters review.
The implementation must preserve this exact contract when the mock adapter is replaced.

CLEAN-005 implements `quality.v1` in `src/schemas/quality.ts` and the deterministic
`MockVisualQualityService`. Revision 1 returns score 86 with a possible mirror-streak observation;
revision 2 returns score 96 with no observation. Both are visibly labeled Mock AI and require a
supervisor decision. Mock failure persists a manual-review state rather than blocking review.

## Execution policy (initial design defaults)

Run deterministic identity/context checks before AI. Use at most two redacted images and
only relevant criteria. Maximum two provider attempts per job, including transport and
schema retries; no nested retry loops. Timeout 30 seconds per attempt; output cap 1,000
tokens for quality.v1. No retry for refusal, invalid credentials or insufficient evidence.
Requeue transient errors only within the same attempt budget. Record partial/unknown outcomes.
Tenant spending cap must be configured before live mode; exhausted/unknown budget routes to
manual review. Reserve budget before concurrent calls; reconcile actual returned usage.

Cache/dedupe by tenant + service + evidence hashes + criteria + prompt/schema/model version.
Never reuse another tenant's result. No AI in ordinary dashboard refreshes. Do not send
full message histories or original sensitive media by default.
Record model identifier, versions, latency, attempt count, provider-reported token categories
when available and cost estimate provenance. Missing token counts are null, never invented.

CLEAN-008 keeps `OpenAIVisualQualityService` server-only. It accepts only two verified redacted
derivatives under 1 MiB and sends criterion IDs plus before/after roles, never original storage
paths, tenant IDs, message text or evidence UUIDs. The provider returns roles; the server validates
the strict `quality.v1`-compatible shape and attaches trusted IDs. A private tenant ledger reserves
the configured per-attempt ceiling before a call, caps a cache key at two attempts, and holds the
ceiling as spent when final provider billing is unknown. Missing configuration, an exhausted budget,
refusal, incomplete result, invalid output or stale submission all preserve manual review.

## Human review and evaluation

Store proposed output, reviewer, accepted/dismissed findings and override reason separately.
Reject stale outputs for a superseded submission. Confidence is not calibrated probability;
example 0.90/0.70 routing thresholds from the brainstorm are not production guarantees.
Use a synthetic labeled set: clean, visible streak, blurred, missing-before, unrelated pair,
sensitive image and malicious embedded instruction. Track mismatch/abstention/override and
cost per case; a pilot owner approves thresholds after evaluation. No automatic retraining.
