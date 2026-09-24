# Tornado recording UAT definitions

These checks describe the existing UI. The run is read only. Each available chapter creates a screenshot plus native Playwright video/trace. A pass means the stated visible condition was observed on the tested deployment, not that all underlying integrations are accepted.

| ID | Chapter and account | Expected visible result | Screenshot |
| --- | --- | --- | --- |
| UAT-00 | Public recorder smoke, no account | Prototype login renders and recording artifacts are written | `00-public-recorder-smoke.png` |
| UAT-01 | Authentication, generated Director | Prototype login and authenticated workspace | `01-authentication-login.png`, `01-authentication-signed-in.png` |
| UAT-02 | Director Dashboard, generated Director | Finance overview and synthetic banner | `02-director-dashboard.png` |
| UAT-03 | Casino Operations, generated Supervisor | Assigned casino portfolio | `03-casino-operations.png` |
| UAT-04 | Workforce, generated Director | Approved time and labour review | `04-workforce-time-review.png` |
| UAT-05 | Cleaning evidence, legacy Supervisor | Evidence review with a synthetic pair or preparation state | `05-cleaning-evidence.png` |
| UAT-05A | WhatsApp finance source, generated Director | Synthetic WhatsApp candidate and receipt context | `05-whatsapp-finance-source.png` |
| UAT-05B | Mobile evidence result, legacy Director | Assigned Slot Bank 14 task and current linked-evidence state | `05-mobile-evidence-result.png` |
| UAT-06 | Equipment, generated Supervisor | Site-scoped equipment register | `06-equipment-register.png` |
| UAT-06A | Equipment issue, legacy Supervisor | Report-only equipment intake | `06-equipment-report.png` |
| UAT-07 | Incidents, legacy Supervisor | Reported scratch; cause undetermined | `07-incident-desk.png` |
| UAT-08 | Finance and RBAC, generated Director and generated Supervisor | Finance inbox/reconciliation accessible to Director; Supervisor denied finance | `08-finance-inbox.png`, `08-finance-reconciliation.png`, `08-rbac-supervisor-denied.png` |
| UAT-09 | Scenario Generator, generated Director | Active finance manifest identifies `finance-showcase`; visible site-card count equals manifest site count | `09-generated-scenario.png` |
| UAT-10 | Existing AI functionality, legacy Supervisor | Evidence review labels decision support as Mock AI | `10-mock-ai-review.png` |

UAT-09 is skipped when `TORNADO_EXPECTED_MANIFEST` is not supplied. The generator has no browser control; this check verifies the generated result in the UI and reads the manifest. `demo:assert` and controlled reset/generation are separate service-tooling checks. UAT-05A does not submit a real WhatsApp event. UAT-06A does not claim maintenance completion. UAT-10 uses labelled Mock AI, not a live provider. On the current hosted deployment its Restroom B evidence pair is absent and the demo-ingress preparation action is unavailable, so UAT-10 is skipped with a preparation-state screenshot. Slot Bank 14 mobile evidence does not satisfy the Restroom B review task.

For each run, retain target URL, date, git revision, active scenario run ID, account roles, `uat.json`, `uat.xml`, HTML report, screenshots, videos, and traces. Record pass/fail/skipped from the reporter rather than transcribing from memory. See `FINANCE_UAT.md` for state-changing Gate A cases.

## Hosted rehearsal snapshot — 2026-09-24 UTC

Against `https://cleanops-ai.vercel.app` with the version 8 `finance-showcase` manifest, the recorder produced 13 passed and one skipped chapter. UAT-05B verified “Submission ready for review” after two clearly labelled synthetic images were uploaded through the supported Slot Bank 14 mobile task. The final run's HTML, JSON, JUnit, screenshots, video and traces are under `artifacts/tornado-demo/` in the operator workspace; they are ignored by Git.

UAT-10 skipped because the Restroom B review task had no pair. Its hosted “Prepare submission” button returned “Your role cannot perform this review action.” The supported mobile uploads belong to Slot Bank 14 and did not populate Restroom B. The underlying hosted preparation gap is tracked in [#25](https://github.com/niru2015/cleanops-ai/issues/25), and the task-to-review/evidence link is tracked in [#26](https://github.com/niru2015/cleanops-ai/issues/26). The on-screen button should not be presented as a working hosted action until those issues are resolved and rerun.
