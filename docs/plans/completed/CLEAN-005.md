# CLEAN-005 — Supervisor quality review and correction

Status: complete on `codex/clean-005-supervisor-review`; draft PR #14. Dependency: CLEAN-004
merged in PR #13. Implementation commit: `f57535d`.

## Objective

Complete the 23:15–23:34 golden slice with structured Mock AI suggestions, explicit human
finding decisions, corrective evidence revision and revision-safe supervisor approval.

## Scope and boundaries

- Exact `quality.v1` Zod shape and deterministic 86/96 `MockVisualQualityService`.
- Quality decisions separated from confirmed findings, corrective actions and inspections.
- Authorized confirmation, dismissal, manual fallback and latest-revision approval RPCs.
- Responsive `/review` pair comparison, action controls and append-only history.
- No live OpenAI call, automatic approval, client release or production deployment.

## Acceptance checks

- Score 86 is labeled Mock AI and creates no finding before supervisor confirmation.
- Correction creates revision 2; score 96 still requires explicit supervisor approval.
- Cleaner self-approval, stale tabs/results and post-approval revision changes are rejected.
- Mock failure remains available for manual review with a recorded reason.
- Browser covers prepare → review → correct → approve → reload persistence.

## Verification evidence

- Passed locally: typecheck, lint, 20 Vitest cases and production build.
- Passed locally: stock PostgreSQL migrations and CLEAN-002 through CLEAN-005 acceptance suite.
- Passed in GitHub CI: canonical Supabase reset, all 35 CLEAN-005 pgTAP assertions and the
  prepare → review → correct → approve → reload Playwright flow.
- Desktop and 390 px mobile screenshots were visually checked; content is readable with no
  horizontal overflow, framework overlay or reported console error.
- Both push and pull-request workflows passed: application jobs in 1m12s/1m07s and database,
  Storage and browser jobs in 5m45s/5m06s.
- Local canonical Supabase/browser execution remains unavailable because this machine has no
  Docker or Podman; GitHub ran those checks against the final implementation commit.
