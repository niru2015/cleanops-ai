# CLEAN-006 active plan

Objective: connect the cleaner mobile workflow, site-zone status and operations command
center to persisted synthetic records.

## Scope

- Add shift coverage requirements, task assignments and audited human replacement selection.
- Build `/operations` with computed coverage, zone status, review/correction and SLA-risk summaries.
- Build `/mobile` with QR zone context and before/after capture through the existing evidence service.
- Keep simulated states explicit and preserve useful empty, loading, upload-failure and denied states.

## Acceptance checks

- Database tests prove 40/42 → 41/42 → 42/42 from distinct eligible attendance records.
- QR context does not create attendance or prove identity.
- Typecheck, lint, unit tests and production build pass.
- Playwright verifies the supervisor desktop sequence and cleaner mobile capture, including failure recovery.

## Non-goals

No automatic dispatch, background location, payroll, live messaging, incident reporting or
client report release.

Next step: implement the database records and shared server services, then connect and verify both journeys.
