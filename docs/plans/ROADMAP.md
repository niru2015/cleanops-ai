# Roadmap and gates

Phase 0 is this context pack. CLEAN-001 through CLEAN-009 map to GitHub issues #1–#9.
Work one issue at a time; use its focused Read list rather than loading the whole pack.

| Phase | Work / dependency | Exit gate |
|---|---|---|
| P0 | Documentation and issue templates | Links valid; scope, states and decisions consistent |
| P1 | CLEAN-001 scaffold; CLEAN-002 tenant/auth/site foundation | App scripts pass; local seed/reset; role and RLS isolation tests |
| P2 | CLEAN-003 durable mock ingress; CLEAN-004 evidence/context; CLEAN-005 supervisor correction | Persistent golden slice, duplicates/crashes safe; no live AI or WhatsApp needed |
| P3 | CLEAN-006 mobile/operations; CLEAN-007 incident/reporting demo | Six connected experiences; client release/isolation; computed metrics |
| P4 | CLEAN-008 OpenAI adapter; CLEAN-009 official WhatsApp adapter | Separate capped evaluations and sandbox end-to-end checks; pilot decisions resolved |
| P5 | Scoped pilot hardening and adjacent modules | Agreed monitoring, restore, retention, support and operational acceptance |

## Bounded issue contracts

- CLEAN-001: [application shell implemented](completed/CLEAN-001.md); no DB schema or provider integrations.
- CLEAN-002: [tenant, auth, site and work foundation implemented](completed/CLEAN-002.md),
  including deterministic seed and denied cross-tenant/cross-site operations.
- CLEAN-003: Read WHATSAPP, ARCHITECTURE. Raw events, jobs, normalized message persistence;
  duplicate/concurrency/restart checks; no media/AI. Depends on 002.
- CLEAN-004: Read WHATSAPP, DATA_MODEL. Private media, verified identities, context/pairing,
  unresolved queue; after-first and bad-media tests. Depends on 003.
- CLEAN-005: Read DOMAIN, AI, DEMO. Mock quality, revision-safe human approval/correction,
  audit history and browser slice. Depends on 004.
- CLEAN-006: Read PRODUCT, DEMO. PWA capture, site zones, coverage from records; no automated
  replacement dispatch. Depends on 005; split screens into separate follow-up issues.
- CLEAN-007: Read DOMAIN, SECURITY, DEMO. Incident/equipment intake, computed SLA and restricted
  report release; no safety-monitor claim. Depends on 005; split intake from reporting.
- CLEAN-008: Read AI, OPENAI, SECURITY. Capped live provider adapter/evaluation. Depends on 005.
- CLEAN-009: Read WHATSAPP, SECURITY. Verified official webhook/media + outbox separately.
  Depends on 003–005 and account readiness; no legacy scraping.

## Open decisions / owners

Product owner before P3: actual contract SLA/exclusions, roles/site permissions and pilot scope.
Pilot owner before P4: customer authorization, capture zones/privacy, retention/region,
WhatsApp account capabilities and outbound rules, AI model/budget/evaluation threshold.
Engineering before P4: production durable runner, retry monitoring, deployment environment,
backup/restore verification and secrets management. Record resolved choices in ADRs.
None blocks synthetic P1–P2. Do not invent legal eligibility requirements or emergency protocols.

## Working cadence

One objective, short Read list, explicit non-goals, executable acceptance checks. Inspect
existing code before adding abstractions. Finish vertical slices before broadening features.
Update the active plan with facts, paths, tests and next step; archive completed plans with
commit/revision when one exists. Avoid transcript/history dumps and speculative generated docs.
