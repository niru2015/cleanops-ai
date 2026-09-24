# CLEAN-012 Stage A — hosted review preparation and reset

Issue: #25. Branch: `codex/clean-012-hosted-demo-prep`.

Scope: authenticated synthetic-site preparation/correction using existing ingress and evidence services; site-bound lease and audit; approved synthetic reset; production-mode browser and database isolation checks. Production simulator and live provider guards stay in force.

Changed paths: `src/services/hosted-demo-fixture.ts`, review/operations actions, hosted access/reset migrations, database/browser tests, relevant docs and e2e runner.

Acceptance checks: typecheck, lint, unit, build, scoped database tests, production-mode browser run. Verify hosted deployment separately after review/merge; local `next start` does not prove hosted environment behavior.

Next: submit focused PR for #25, then work #26 on its own branch. Gate A #38 remains a separate release verification gate.
