# CLEAN-006 — Mobile and operations experiences

Status: implemented and verified in PR #15.

Objective: connect the cleaner mobile workflow, site-zone status and operations command
center to persisted synthetic records.

## Scope

- Add shift coverage requirements, task assignments and audited human replacement selection.
- Build `/operations` with computed coverage, zone status, review/correction and SLA-risk summaries.
- Build `/mobile` with QR zone context and before/after capture through the existing evidence service.
- Keep simulated states explicit and preserve useful empty, loading, upload-failure and denied states.

## Delivered

- `/operations` calculates coverage, review/correction load, SLA risk and zone status from records.
- Supervisors explicitly select, assign and record attendance for eligible replacements.
- `/mobile` selects expiring QR task context and uses shared ingress/evidence services for capture.
- Synthetic loading, empty, access-denied and retryable upload-failure states remain usable.

## Verification

- PostgreSQL compatibility and Supabase pgTAP suites prove 40/42 → 41/42 → 42/42 from
  distinct eligible attendance and preserve tenant isolation.
- A database check proves QR context creates no attendance event.
- Typecheck, lint, 22 unit tests, production build and Storage checks pass.
- Playwright passes the supervisor desktop, cleaner mobile failure/retry/capture and existing
  review journeys with no console errors; screenshots were inspected from green CI run 35075916194.

## Non-goals

No automatic dispatch, background location, payroll, live messaging, incident reporting or
client report release.

Next step: merge PR #15, then begin CLEAN-007 incident and reporting work.
