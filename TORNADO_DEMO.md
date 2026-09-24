# Tornado demo recording and UAT

This is a **synthetic CleanOps prototype**. Casino and equipment names are reference names under ADR 008; the recording does not show Tornado customer data, a live Tornado deployment, a live Sage feed, or an existing WhatsApp group connection.

## Run

Use a private shell environment. The default target is a local Next.js app on `127.0.0.1:3000`; Playwright starts it automatically. The local database must already be running, seeded, and have matching demo Auth accounts. For an approved hosted recording, set `TORNADO_DEMO_BASE_URL` to the exact deployment URL. Do not run against an unknown deployment.

```bash
export TORNADO_DEMO_PASSWORD='your-protected-demo-password'
export TORNADO_OPERATIONS_PASSWORD='your-separate-legacy-demo-password'
export TORNADO_DEMO_BASE_URL='https://your-approved-demo-host.example'
export TORNADO_EXPECTED_MANIFEST='fixtures/generated/hosted/<project-ref>/finance-showcase/expected.json'
npm run demo:tornado
```

Omit `TORNADO_DEMO_BASE_URL` for local execution. The finance showcase and older operational walkthrough use **separate passwords**. Without `TORNADO_OPERATIONS_PASSWORD`, the legacy evidence, incident, equipment-report and Mock AI chapters are explicitly skipped; the generated site portfolio, time review and finance chapters still run. `TORNADO_EXPECTED_MANIFEST` is optional; without it UAT-09 is explicitly skipped. The file must describe the *active* scenario run. `npm run demo:assert -- finance-showcase` is a separate read-only source assertion that needs the configured database access. The browser recorder does not reset or generate shared data.

The recorder is read only. The legacy review screen's “Prepare submission” action depends on demo ingress, which is unavailable on the current hosted deployment. The supported mobile task captures Slot Bank 14 evidence; the Mock AI review fixture is a separate Restroom B task. The recorder reports the review preparation state and skips Mock AI when its pair is absent. It never treats Slot Bank 14 uploads as Restroom B evidence.
After an authorized mobile upload, set `TORNADO_EXPECT_MOBILE_EVIDENCE=1` to require the “Submission ready for review” result in UAT-05B.

Use `npm run demo:tornado -- --grep 'UAT-08'` to rerun a chapter. Install the pinned browser with `npx playwright install chromium` if it is missing. The command exits nonzero for failed checks or missing credentials.

For a recorder smoke check without a password, run `TORNADO_DEMO_PUBLIC_ONLY=1 npm run demo:tornado`. This runs only UAT-00 and proves that screenshot, video, trace, and reporters can write artifacts; it does not test authenticated features.

## Account map

The login picker exposes these synthetic identities. Set the matching account passwords privately. Override emails when a local fixture differs.

| Purpose | Default login | Override |
| --- | --- | --- |
| Finance Director | `finance-showcase.darrel-director@cleanops.example.com` | `TORNADO_FINANCE_DIRECTOR_EMAIL` |
| Finance Area Manager | `finance-showcase.shayana-area@cleanops.example.com` | `TORNADO_FINANCE_AREA_EMAIL` |
| Finance Supervisor denial | `finance-showcase.hardeep@cleanops.example.com` | `TORNADO_FINANCE_SUPERVISOR_EMAIL` |
| Legacy operations Supervisor | `hardeep.supervisor@cleanops.example.com` | `TORNADO_OPERATIONS_SUPERVISOR_EMAIL`; uses `TORNADO_OPERATIONS_PASSWORD` |
| Legacy operations Director | `darrel.director@cleanops.example.com` | `TORNADO_OPERATIONS_DIRECTOR_EMAIL`; uses `TORNADO_OPERATIONS_PASSWORD` |

The generated finance organization and the legacy operations walkthrough are separate. A single account cannot be assumed to see both. The recorder uses the generated Supervisor for the casino portfolio/equipment register, the generated Director for time/labour, the legacy Supervisor for review/incidents/equipment issue intake, and the legacy Director for the mobile task result. `npm run demo:provision-logins` provisions named legacy accounts when its protected prerequisites are present; generated finance identities are provisioned by the scenario workflow. Never put a password in source, slides, or the handoff manifest.

## What the command records

The modular Playwright UAT chapters live in `tests/tornado/`. Each has a named trace step, a screenshot when its required screen is available, and a Chromium video. The native Playwright HTML, JSON, and JUnit reporters record pass/fail/skip, duration, and failure attachments. Paths are below `artifacts/tornado-demo/`:

| Path | Use |
| --- | --- |
| `screenshots/*.png` | Key-screen stills for slides |
| `videos-and-traces/` | Per-test browser videos, traces, and failure evidence |
| `html-report/index.html` | Human-readable UAT report |
| `results/uat.json`, `results/uat.xml` | Machine-readable UAT results |
| `results/preflight.json` | Target mode and credential-presence check; no secret values |

Generated artifacts are Git-ignored and may include private session data or credential values in trace actions. Share reviewed screenshots or edited video clips only. Keep raw traces and reports in protected storage.
Each successful preflight clears the previous generated screenshots and reports so the folder always describes one run. Save a protected copy before rerunning if you need the earlier evidence.

Playwright MCP / Agent CLI chapter annotation and cursor highlighting are not used because the repository has a pinned native Playwright Test runner and no verified compatible export path for those features. Named `test.step` entries supply trace chapters; video, traces and screenshots are native Playwright outputs. The runner makes no claim that action highlights are burned into video.

## UAT scope

See [UAT definitions](docs/demo/TORNADO_RECORDING_UAT.md). The run checks visible pages and role denial, and optionally compares visible site count to the generated manifest. It does not prove receipt posting, contract activation, scenario replay, private media authorization, or live integration behavior. Run the controlled [Finance UAT](docs/demo/FINANCE_UAT.md) and [finance rehearsal](docs/demo/TORNADO_FINANCE_REHEARSAL.md) separately before calling the Finance MVP accepted.

For CI, configure `TORNADO_DEMO_PASSWORD` and `TORNADO_DEMO_ALLOWED_ORIGIN` as protected repository secrets. The allowed origin must exactly match the chosen HTTPS demo host. Provide the active manifest as a protected artifact or leave its check skipped. The manual GitHub Actions workflow installs Chromium, records the demo, and retains artifacts for seven days. Do not make this hosted run a required pull-request check without an isolated fixture environment.

## Presentation handoff

Use [narration](docs/demo/TORNADO_NARRATION.md) and [slide map / Canva manifest](docs/demo/TORNADO_CANVA_HANDOFF.json). Review every still and UAT status before importing into Canva. Slides must retain the prototype/synthetic disclaimer. Generate the deck from successful screenshots; label skipped or failed chapters as unavailable rather than replacing them with invented screens. The source finance scenario may change, so refresh the expected manifest and screenshots immediately before external presentation.
