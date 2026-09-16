# CLEAN-007 — Incident, equipment and client reporting demo

Status: implemented and verified in draft PR #16. Implementation commits: `f133127`, `b887895`.

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

## Delivered

- `/incidents` records the synthetic scratch as a neutral incident with attributed statement,
  initial action, deterministic timeline and audited wording correction; the scrubber remains a
  `reported` equipment issue without fabricated maintenance completion.
- `/reports` calculates and stores the versioned 149/150 = 99.3% snapshot once, discloses the
  denominator, exclusions and window, and labels safety N/A.
- `/reports/client` remains empty until explicit supervisor release, then returns only the redacted
  snapshot after active client membership and site-grant checks.

## Verification evidence

- Passed locally: typecheck, lint, 24 Vitest cases, production build and stock PostgreSQL tenant,
  site, draft/release, export and private-original isolation checks.
- Passed final push and pull-request CI: application jobs in 1m11s; database, Storage, pgTAP and
  Playwright jobs in 5m50s and 5m08s (runs 35122774542 and 35122779502).
- Playwright covered incident intake, audited correction, equipment intake, draft denial, computed
  report release, reload-safe client view and mobile overflow. Desktop and 390 px screenshots were
  inspected; both were readable and the final timeline uses deterministic golden-demo times.
- No remote Supabase migration or production deployment was performed.
