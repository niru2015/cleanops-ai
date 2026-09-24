# Gate A execution record — 2026-09-24

Issue: [CLEAN-025 / #38](https://github.com/niru2015/cleanops-ai/issues/38). Gate A is the synthetic manager demo; Gate B is a separate production pilot decision. The finance-first override in #38 governs this record.

## Implementation and local evidence

| Requirement | Current evidence | State |
| --- | --- | --- |
| Hosted fixture repair and repeatable evidence reset (#25) | [PR #88](https://github.com/niru2015/cleanops-ai/pull/88), production-mode browser test and local database checks | In review; not deployed |
| Actual photo evidence and after-only correction (#26) | [PR #89](https://github.com/niru2015/cleanops-ai/pull/89), production-mode browser and database checks | In review; not deployed |
| Deterministic finance source data (#28) | `npm run demo:generate -- finance-showcase --seed 20260925` generated 4 sites, 80 workers and 18 personas locally | Pass locally |
| Manifest and presenter controls | `npm run demo:assert -- finance-showcase` matched CAD 30,133.92 current expected revenue and CAD 754.39 approved expense cost; `npm run demo:presenter -- finance-showcase` produced the guide | Pass locally |
| Local reset and alternate-seed replay | `node scripts/demo-scenario.mjs reset-preflight finance-showcase` verified the registered scope, `npm run demo:reset -- finance-showcase` passed, then seed `20260926` generated and asserted. Revenue changed to CAD 29,308.00 and approved expense cost to CAD 756.46; four sites, 80 workers, 18 personas and Director/Area Manager/Client grants remained defined. | Pass locally; hosted replay pending |
| Hosted finance UAT | [FINANCE_UAT.md](FINANCE_UAT.md) steps 1–12, including contract activation, supported receipt intake, labour posting, reconciliation and alternate-seed replay | Pending |
| Recording and access evidence | [TORNADO_DEMO.md](../../TORNADO_DEMO.md) defines video, screenshot, trace and HTML outputs; [TORNADO_FINANCE_REHEARSAL.md](TORNADO_FINANCE_REHEARSAL.md) records earlier read-only hosted checks | Full Gate A recording and network/device checks pending |

The local run logs and first-seed manifest snapshot are in the ignored `artifacts/tornado-demo/gate-a/` folder. Generated source files and the second-seed `expected.json` are in ignored `fixtures/generated/finance-showcase/`. These are local synthetic results, not evidence that the hosted app has the two new pull requests or that hosted state-changing UAT passed. PR #89 database checks were still running when this record was written; use the pull request's current checks rather than this snapshot for release decisions.

## Release sequence and acceptance record

1. Review and merge #88, then #89, after both required `application` and `database` checks pass. Check the deployed commit and migration ledger; record them here. The PRs are stacked, so update/rebase #89 against the merged base as needed.
2. On the dedicated synthetic hosted organization, run the read-only hosted preflight described in [DATA_FACTORY.md](DATA_FACTORY.md). Review its exact delete/create scope before the separately approved hosted `--apply` reset or generation. Record run ID, seed, organization, manifest hash and post-run assertion. Keep credentials outside Git and the evidence pack.
3. Execute [FINANCE_UAT.md](FINANCE_UAT.md) steps 1–12 on the deployed build. For each action, save source ID, actor/site, expected and actual result, screenshot/trace, and pass/fail. Require real service-path writes for at least one critical finance flow; generated rows alone do not meet #38.
4. In separate sessions, test Director, Area Manager, Supervisor/Worker and Client; inspect forbidden site/role, revoked membership and signed-media network responses. Check reload persistence, duplicate/retry/failure and month-boundary behavior. Record a real iPhone camera/library and desktop run with console and keyboard observations.
5. Replay an approved reset with a second seed, assert changed source totals and unchanged access rules, and check unrelated tenant/Auth/private object isolation. Finish the 10–12-minute run and redacted two-minute recording, printable report and rotated demo credentials. Keep synthetic and simulated-integration labels on shared material.

Record actual results below when each step executes. Do not close #38 or claim Gate A complete from local fixtures, green CI, or a read-only presentation.

| Gate | Result | Evidence |
| --- | --- | --- |
| Deployed commit and migration ledger | Pending | |
| Hosted controlled finance UAT | Pending | |
| Role, site, revoked and signed-media probes | Pending | |
| Alternate-seed replay and isolation | Pending | |
| Real iPhone, desktop, keyboard and console | Pending | |
| Redacted recording, report and credential rotation | Pending | |
