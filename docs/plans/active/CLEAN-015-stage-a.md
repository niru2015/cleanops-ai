# CLEAN-015 Stage A — deterministic scenario framework

Issue #28, Stage A only. Branch `codex/clean-015-scenario-stage-a` from `main` at `60efac2`.

## Plan and acceptance

- Validate versioned manifests and reference packs; deterministic IDs and seeded variable facts.
- Generate base organization/site/worker/persona data through a local-only service client, with a scoped file registry and safe reset checks.
- Write expected-manifest, assert and presenter commands; keep Stage B module switches rejected until implemented.
- Prove repeatability, different-seed variation, invalid-input rejection, reset/regeneration and unchanged other-tenant fixtures.
- Run `typecheck`, `lint`, `test`, `build` and local database integration checks.

## Changed paths

`src/demo/*`, `scripts/demo-scenario.mjs`, `fixtures/reference/*`, `fixtures/scenarios/*`, `docs/demo/DATA_FACTORY.md`, `package.json`, `.gitignore`, focused tests and docs.

## Status

Stage A local verification passed: `typecheck`, `lint`, `test` (57 tests), `test:db`
(205 pgTAP tests after clean reset), `build`, and `test:scenario` (generate/assert,
partial recovery, reset/regeneration and other-tenant isolation). The four-site
`finance-showcase` pack generated and reset locally. Stage B adapters
remain separate issue-owned changes. PR handoff pending; no hosted deployment.
