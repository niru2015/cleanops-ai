# Roadmap and gates

Phase 0 is this context pack. CLEAN-001 through CLEAN-009 map to GitHub issues #1–#9;
CLEAN-010 is the hosted synthetic demo access gate in issue #20.
CLEAN-011 is real mobile camera/library upload in issue #22 (merged, PR #23).
CLEAN-026 and CLEAN-027 (issues #39 and #41) persist Make WhatsApp events and add normalized messages and finance.
Tornado Phase 2 (parent issue #24) plans CLEAN-012 to CLEAN-025 as issues #25 to #38.
Work one issue at a time; use its focused Read list rather than loading the whole pack.

| Phase | Work / dependency | Exit gate |
|---|---|---|
| P0 | Documentation and issue templates | Links valid; scope, states and decisions consistent |
| P1 | CLEAN-001 scaffold; CLEAN-002 tenant/auth/site foundation | App scripts pass; local seed/reset; role and RLS isolation tests |
| P2 | CLEAN-003 durable mock ingress; CLEAN-004 evidence/context; CLEAN-005 supervisor correction | Persistent golden slice, duplicates/crashes safe; no live AI or WhatsApp needed |
| P3 | CLEAN-006 mobile/operations; CLEAN-007 incident/reporting demo | Six connected experiences; client release/isolation; computed metrics |
| P4 | CLEAN-008 OpenAI adapter; CLEAN-009 official WhatsApp adapter | Separate capped evaluations and sandbox end-to-end checks; pilot decisions resolved |
| P5 | Scoped pilot hardening and adjacent modules | Agreed monitoring, restore, retention, support and operational acceptance |
| Demo | CLEAN-010 hosted role access | Temporary Auth users, role/site isolation and browser walkthrough verified |
| Demo | CLEAN-011 real mobile upload | Phone camera/library files privately uploaded, content-verified and linked (merged; physical-phone hosted rehearsal open in #26) |
| P5 | CLEAN-026 Make WhatsApp persistence | Scoped Make endpoint persists Cloud events durably; group capture not claimed |
| Demo | Role-scoped BC casino demo (PRs #43-#46, no CLEAN id) | Role/casino navigation, Director-only finance writes, site portfolio, equipment register |
| P5 | CLEAN-027 normalized message and finance workflows | Supervisors confirm site context; append-only inventory and labour costs carry secure site attribution |

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
- CLEAN-010: [hosted demo access implemented](completed/CLEAN-010.md), including Supabase Auth,
  role-scoped synthetic actions, a site-scoped reset and a shareable login flow; live providers
  remain disabled.
- CLEAN-011: [real mobile photo upload implemented](completed/CLEAN-011.md), replacing the synthetic capture
  control with camera/library selection, private direct upload and verified task linkage.
- CLEAN-026: [Make WhatsApp persistence implemented](completed/CLEAN-026.md), a token-scoped endpoint that
  reuses durable ingestion; existing-group capture remains unproven and gated (ADR 002, issue #37).
- CLEAN-027: [normalized messages and finance implemented](completed/CLEAN-027.md): context/media tables, supplier and
  item catalogues, append-only inventory and labour capture, and a site-authorized RPC for untrusted message text.
  Its supervisor queue UI is currently unmounted; see the plan's status update.

## Tornado Phase 2 backlog (parent #24) — implementation status

Baseline for the issues was `b51399a`; status below is against `main` at `e6aedc5`. "Foundation" means reusable
tables or code exist but the issue's acceptance criteria are not met. No item below is complete.

| Issue | Work | Status on main |
|---|---|---|
| #25 CLEAN-012 | Production-mode hosted prep/reset | Not started. `submitSyntheticPair` in `src/app/review/actions.ts` still requires the simulator flag, which is forced off in production. |
| #26 CLEAN-013 | Connected evidence, real photo review, correction | Not started. CLEAN-011 upload is merged; review still shows placeholder evidence and fixed task IDs. |
| #27 CLEAN-014 | Canonical intake API + resolution inbox | Foundation: durable ingestion, Make Cloud adapter (CLEAN-026), context tables/RPC (CLEAN-027). No generic `/api/integrations/events`; existing queue UI unmounted (re-mount on `/finance` tracked in #50). |
| #28 CLEAN-015 | Deterministic multi-site fixtures | Not started. `supabase/seed.sql` has the Aurora fixture, "Copper Peak East" and, in the isolation tenant, "Northstar Harbour"; no Harbour/Cedar sites, no June-August data. |
| #29 CLEAN-016 | Announcements + acknowledgements | Not started. |
| #30 CLEAN-017 | Supply requests, approval, stock history | Foundation: `vendors`, `inventory_items`, append-only `inventory_transactions`. No requests, approvals or conversions. |
| #31 CLEAN-018 | Assets, inspections, repair cost | Foundation: read-only `equipment_models`/`equipment_assets`; `equipment_reports` intake. No inspections, checklists, cost lines or report-to-asset link. |
| #32 CLEAN-019 | Absence register | Not started. Staffing coverage/replacement exists. |
| #33 CLEAN-020 | Reconciled revenue/cost import | Foundation: manual `labor_cost_entries` and inventory capture. No revenue, import batches or reconciliation. |
| #34 CLEAN-021 | Manager overview and exceptions | Not started. `/operations` site portfolio lists counts only. |
| #35 CLEAN-022 | Contract obligations, one-off jobs | Not started. Versioned `sla_definitions` fixture exists. |
| #36 CLEAN-023 | Handover, follow-up, complaint closure | Not started. Corrective actions and incidents exist. |
| #37 CLEAN-024 | Make/WhatsApp proof and group strategy | Partial: CLEAN-026 proves authenticated persistence of Cloud events. Group media, phone-to-hash proof and the strategy ADR are open. |
| #38 CLEAN-025 | Release gates | Not started. |

## Owner decisions of 2026-09-21 and follow-up issues

| Issue | Work |
|---|---|
| #48 CLEAN-028 | Grant Directors update/delete on finance ledgers (ends grant-based append-only). |
| #49 CLEAN-029 | Narrow supplier and inventory item visibility to Directors, Area Managers and Operations Managers. |
| #50 CLEAN-030 | Restore the message-context queue on `/finance`, scoped to the selected site. |
| #51 CLEAN-031 | ADR 008: real casino names stay, repository stays public, supply requests approved by managers and Directors. |

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
