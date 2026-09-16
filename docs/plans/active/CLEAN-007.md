# CLEAN-007 — Incident, equipment and client reporting demo

Status: active on `codex/clean-007-incidents-reporting`.

## Objective

Complete the P3 golden demo with neutral incident and equipment intake, one versioned SLA
calculation, explicit supervisor release and a released-only client view.

## Scope

- Record the 00:17 scratch report as an incident, attributed statement, action and timeline.
- Record the 02:05 scrubber issue as an equipment report that remains `reported`.
- Compute the 149 / 150 = 99.3% fixture from versioned run results and show the denominator,
  window and exclusions once.
- Prepare and explicitly release a redacted report; authorize client access by active membership
  plus site grant.
- Audit incident wording corrections and report release.

## Acceptance checks

- Database tests cover role, tenant, site, draft/released and safe-export boundaries.
- UI states cause no blame, completed-maintenance or safety-monitor claim.
- Desktop supervisor and mobile client journeys persist across reload.
- Typecheck, lint, unit tests, production build and the database harness pass.

## Boundaries

Synthetic data only. No emergency response, CCTV, maintenance workflow, live safety monitoring,
legal certification, remote Supabase migration or production deployment.
