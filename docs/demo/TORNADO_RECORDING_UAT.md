# Tornado recording UAT definitions

These checks describe the existing UI. All chapters are read only and create a screenshot plus native Playwright video/trace. A pass means the stated visible condition was observed on the tested deployment, not that all underlying integrations are accepted.

| ID | Chapter and account | Expected visible result | Screenshot |
| --- | --- | --- | --- |
| UAT-00 | Public recorder smoke, no account | Prototype login renders and recording artifacts are written | `00-public-recorder-smoke.png` |
| UAT-01 | Authentication, generated Director | Prototype login and authenticated workspace | `01-authentication-login.png`, `01-authentication-signed-in.png` |
| UAT-02 | Director Dashboard, generated Director | Finance overview and synthetic banner | `02-director-dashboard.png` |
| UAT-03 | Casino Operations, legacy Supervisor | Assigned casinos | `03-casino-operations.png` |
| UAT-04 | Workforce, legacy Supervisor | Night shift staffing coverage | `04-workforce-coverage.png` |
| UAT-05 | WhatsApp / cleaning evidence, legacy Supervisor | Evidence review with a synthetic pair or preparation state | `05-cleaning-evidence.png` |
| UAT-06 | Equipment, legacy Supervisor | Report-only equipment intake | `06-equipment-report.png` |
| UAT-07 | Incidents, legacy Supervisor | Reported scratch; cause undetermined | `07-incident-desk.png` |
| UAT-08 | Finance and RBAC, generated Director and generated Supervisor | Finance inbox/reconciliation accessible to Director; Supervisor denied finance | `08-finance-inbox.png`, `08-finance-reconciliation.png`, `08-rbac-supervisor-denied.png` |
| UAT-09 | Scenario Generator, generated Director | Active finance manifest identifies `finance-showcase`; visible site-card count equals manifest site count | `09-generated-scenario.png` |
| UAT-10 | Existing AI functionality, legacy Supervisor | Evidence review labels decision support as Mock AI | `10-mock-ai-review.png` |

UAT-09 is skipped when `TORNADO_EXPECTED_MANIFEST` is not supplied. The generator has no browser control; this check verifies the generated result in the UI and reads the manifest. `demo:assert` and controlled reset/generation are separate service-tooling checks. UAT-05 does not submit a real WhatsApp event or photograph. UAT-06 does not claim maintenance completion. UAT-10 does not call a live AI provider.
UAT-10 is skipped with a preparation-state screenshot if the legacy evidence pair has not been created. The recorder never creates it on the shared demo.

For each run, retain target URL, date, git revision, active scenario run ID, account roles, `uat.json`, `uat.xml`, HTML report, screenshots, videos, and traces. Record pass/fail/skipped from the reporter rather than transcribing from memory. See `FINANCE_UAT.md` for state-changing Gate A cases.
