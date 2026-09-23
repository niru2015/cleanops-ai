# Deterministic demo scenarios (CLEAN-015 Stage A)

Stage A creates base organizations, clients, sites, workers, memberships and site grants in **local Supabase only**. It does not generate contracts, expenses, time, finance postings, equipment events, messages or reports yet. `finance-showcase`, `operations-showcase` and `edge-cases` currently declare future cases but produce only the base layer. Their control totals deliberately mark finance as `null`; no dashboard total is inserted to make a demo look complete.

## Commands

Start the local Supabase stack, then run:

```bash
npm run demo:generate -- stage-a-smoke
npm run demo:assert -- stage-a-smoke
npm run demo:presenter -- stage-a-smoke
npm run demo:reset -- stage-a-smoke
npm run demo:generate -- stage-a-smoke --seed 20260923
```

The CLI obtains a local service key and database URL from `supabase status` and rejects non-local endpoints. `psql` is required for reset's read-only check across organization-scoped tables. It does not read a hosted project's secret from `.env.local`. The generated Auth personas have no password; a protected provisioning step must set one before sign-in. No browser reset endpoint exists.

## Add a scenario

1. Add `fixtures/scenarios/<name>/scenario.json`; its `scenarioId` must match the folder name. Copy `stage-a-smoke` and choose a seed, clock, site/worker counts, and `referencePack`.
2. Use only `modules.base: true` until an owning Stage B adapter is implemented. Setting an unsupported module to `true` fails validation before any database write. `cases` describe planned journey coverage and do not themselves create business facts.
3. Run generate, assert, presenter, reset and regenerate locally. Add an assertion for each new module's source-backed totals when its adapter lands.
4. Bump `schemaVersion` or `generatorVersion` when changing the meaning of IDs or generated facts. Do not make application code read `fixtures/generated`.

Zod validates the manifest and reference pack. SHA-256-derived UUIDv5-shaped IDs depend on scenario ID and entity path. The run ID also includes the seed; identity IDs stay stable between seeds while the seeded generator changes variable facts such as site assignments. The same inputs and code produce byte-equivalent expected manifests.

## Registry and reset boundary

`fixtures/generated/<scenario-id>/registry.json` is a local, ignored service-tooling registry. It records the run, seed, generator version, organization ID, status and created Auth IDs. The scenario plan contains every base entity ID; the registry is written before database insertion and marked `partial` on failure. A partial run can be reset and regenerated. Reset checks that the organization slug and all Stage A IDs match the plan, refuses deletion when the generated organization has operational/finance records outside the Stage A registry, deletes only listed base IDs, and removes only Auth users tagged with the scenario ID. Other tenant and legacy seed IDs are untouched. Stage B adapters must extend the registry and reset preflight before writing additional entities.

`expected.json` contains the scenario version, seed, clock, source-backed entity counts, role/site matrix and explicit not-implemented finance/reconciliation fields. It is for assertions and demos only. The app never imports it. `demo:assert` queries the local database and fails if stored base records differ. `presenter-tests.md` is generated from the same plan and currently states which journeys are not available.

## Reference names and privacy

`fictional-v1` is the default for tests. `tornado-v1` separates owner-approved display identities from generated IDs and transaction values: Grand Villa (already named in this repository), [River Rock Casino Resort](https://riverrock.com/), and [Parq Casino Vancouver](https://www.parqcasino.com/) are venue references. Equipment reference names are drawn from `supabase/seed.sql`. The named personas are demo display identities from issue #28 and `scripts/provision-demo-logins.mjs`. These references imply no customer relationship, employment facts, actual contract or measured performance. All generated business records remain synthetic, per ADR 008.

The fourth finance-showcase site currently uses a fictional fallback until the owner supplies another approved hosted venue name. Site names are display data only; no ID, authorization rule or assertion depends on their literal wording.

## Stage B boundary

Contracts (#35/#62), expenses (#63), time/labour (#64), projects (#65), reconciliation (#66), supplies (#30), equipment (#31) and other adapters attach to this framework only after their owning schemas/services land. Critical journeys must replay through production services; direct fixture insertion alone cannot verify approval or ingestion behavior. Stage A is not a claim that the 10–15 minute finance showcase is ready.
