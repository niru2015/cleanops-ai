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
- CLEAN-003: [durable mock ingress implemented](completed/CLEAN-003.md), including raw events,
  leased jobs, normalized messages and duplicate/concurrency/restart checks; no media/AI.
- CLEAN-004: [operational evidence implemented](completed/CLEAN-004.md), including private media,
  verified identities, deterministic context/pairing, unresolved review, recovery and isolation.
- CLEAN-005: [supervisor review implemented](completed/CLEAN-005.md), including mock quality,
  revision-safe human approval/correction, audit history and the browser slice.
- CLEAN-006: [mobile and operations implemented](completed/CLEAN-006.md), including shared
  PWA evidence capture, site-zone states, computed coverage and human replacement assignment.
- CLEAN-007: [incident, equipment and client reporting implemented](completed/CLEAN-007.md),
  including versioned SLA computation, explicit audited release and site-authorized redacted view.
- CLEAN-008: [capped OpenAI quality analysis implemented](completed/CLEAN-008.md), including strict output validation, tenant caps, retries, cache and synthetic evaluation records.
- CLEAN-009: [official WhatsApp Business adapter implemented](completed/CLEAN-009.md), including
  raw signature checks, account-scoped ingestion/media, consent-aware outbox, delivery events,
  retries and readiness checks. Live sandbox evidence still depends on customer account readiness;
  no legacy scraping.

## Open decisions / owners

Product owner before P3: actual contract SLA/exclusions, roles/site permissions and pilot scope.
Pilot owner before P4: customer authorization, capture zones/privacy, retention/region,
WhatsApp account capabilities and outbound rules, AI model/budget/evaluation threshold.
Engineering before pilot: production worker schedule, alert delivery, deployment environment,
backup/restore verification and secrets management. Record resolved choices in ADRs.
None blocks synthetic P1–P2. Do not invent legal eligibility requirements or emergency protocols.

## Working cadence

One objective, short Read list, explicit non-goals, executable acceptance checks. Inspect
existing code before adding abstractions. Finish vertical slices before broadening features.
Update the active plan with facts, paths, tests and next step; archive completed plans with
commit/revision when one exists. Avoid transcript/history dumps and speculative generated docs.
