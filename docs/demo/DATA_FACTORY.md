# Deterministic demo scenarios (CLEAN-015 Stage A and finance adapters)

Stage A creates base organizations, clients, sites, workers, memberships and site grants in **local Supabase by default**. CLEAN-022 adds the first Stage B adapter: `finance-showcase` and `contract-smoke` create a synthetic manual fixed-monthly contract and future amendment, replay Director approval/activation through production RPCs, and reconcile expected revenue. CLEAN-035 adds Finance Inbox app/WhatsApp expense cases, verified synthetic receipts and approved direct-cost postings to `finance-showcase`. CLEAN-036 adds attendance, missing-checkout, overtime, worker-swap, effective-rate-change and manual-project time cases with approved cost. CLEAN-037 adds two canonical one-off projects: a completed Hastings deep clean with source-linked labour, fuel, supplies, invoice and accepted accounting revenue, plus an incomplete follow-up whose final margin stays pending. CLEAN-038 adds accepted accounting cost rows, unique and ambiguous match proposals, an unmatched source, and a closed month made stale by a late accepted import. Generator version 7 adds two August approved expenses, moves approved project labour into August, accepts a complete synthetic August accounting batch for two sites, links all three direct costs, and closes a current comparison month. Version 8 grants the two Area Manager personas the populated August sites and adds a same-tenant client viewer for denial testing. Equipment events and reports remain ungenerated. `operations-showcase` and `edge-cases` still produce only the base layer. No dashboard total is inserted to make a demo look complete.

The CLEAN-017 supply workflow adds operational request and stock tables, but the current scenario parser still rejects `modules.supplies`. The finance-showcase pack is therefore unchanged in this PR. The #28 supply adapter must register its catalogue, requests, events, receipts and stock movements; assert the normal/high/partial/retry cases; and extend exact-scope reset before the supply scenario acceptance can be checked.

## Commands

Start the local Supabase stack, then run:

```bash
npm run demo:generate -- stage-a-smoke
npm run demo:assert -- stage-a-smoke
npm run demo:presenter -- stage-a-smoke
npm run demo:reset -- stage-a-smoke
npm run demo:generate -- stage-a-smoke --seed 20260923
npm run demo:generate -- contract-smoke
npm run demo:assert -- contract-smoke
npm run demo:reset -- contract-smoke
npm run demo:generate -- finance-showcase
npm run demo:assert -- finance-showcase
npm run demo:presenter -- finance-showcase
npm run demo:reset -- finance-showcase
```

The default CLI mode obtains a local service key and database URL from `supabase status` and rejects non-local endpoints. `psql` is required for reset's read-only check across organization-scoped tables. It does not read a hosted project's secret from `.env.local`. Local generated Auth personas have no password; a protected provisioning step must set one before sign-in. No browser reset endpoint exists.

### Protected hosted finance showcase

After the service-only `demo_scenario_runs` migration is released, the same deterministic plan can be
replayed into a **dedicated synthetic organization** in the explicitly named hosted project. The
local commands above still target local Supabase by default. Hosted mode is limited to
`finance-showcase`; it never adopts an existing organization, site ID, email, or run. The selected
organization ID must equal the deterministic scenario plan ID. Presenters sign in with the
scenario's generated Director account; an existing Director in a different organization will not
see this scenario, because membership and RLS remain tenant-scoped.

Version 8 is a new hosted release, not an in-place change to the existing version 7 run. The
CLI reconstructs a run from its recorded generator version, so a guarded version 7 assert/reset
continues to use its original 17 personas and site grants. Run read-only `reset-preflight` against
the exact hosted project and organization, and review its run ID, counts and scope check before
any authorized reset. Then run a fresh version 8 preflight and generate with
an alternate seed; verify its 18 personas, Director access, River Rock and Grand Villa Area
Manager grants, and the Grand Villa client-viewer denial. The login picker offers these
generated identities directly, but their passwords stay in the protected operator channel.

Set `CLEANOPS_HOSTED_DEMO_URL`, `CLEANOPS_HOSTED_DEMO_SECRET_KEY`,
`CLEANOPS_HOSTED_DEMO_PUBLISHABLE_KEY`, and a unique 12+ character
`CLEANOPS_HOSTED_DEMO_PASSWORD` in the protected operator environment. Never commit values.
Hosted reset also requires an authenticated Supabase CLI linked to that project; it uses
`supabase db query --linked --project-ref` to check organization scope and remove immutable
scenario rows. No database password is needed. Run the read-only preflight first and review its project,
organization, sites, personas, expected controls, and collisions:

```bash
node scripts/demo-scenario.mjs plan finance-showcase
node scripts/demo-scenario.mjs preflight finance-showcase --target hosted --project-ref <project-ref> --organization-id <scenario-organization-id>
node scripts/demo-scenario.mjs generate finance-showcase --target hosted --project-ref <project-ref> --organization-id <scenario-organization-id> --apply
node scripts/demo-scenario.mjs assert finance-showcase --target hosted --project-ref <project-ref> --organization-id <scenario-organization-id>
node scripts/demo-scenario.mjs reset finance-showcase --target hosted --project-ref <project-ref> --organization-id <scenario-organization-id> --apply
```

Generation is a separately approved hosted data release. Version 7 uploads the synthetic source
and amendment PDFs to private contract storage and verifies downloaded bytes against the pack;
the synthetic receipt bytes likewise use private evidence/receipt storage. It writes a service-only database registry
before business records and updates that registry after each replay step. `assert` reads the
registry and source records; reset checks the exact scenario-owned IDs and refuses unrelated
organization rows before any deletion. Keep a copy of the generated manifest and assertion log
with the release evidence. A partial failure leaves the registry marked `partial`; inspect and
reset it before another generation attempt. Hosted reset uses the linked project and
privileged trigger handling required by immutable demo finance rows. Never run these commands
against an organization containing customer or unrelated demo data. No browser reset endpoint exists.
Synthetic WhatsApp replay leases only the processing job returned for its own event. It cannot
claim the next job in the shared production queue; the normal worker still uses the global
claim RPC for live work.

## Add a scenario

1. Add `fixtures/scenarios/<name>/scenario.json`; its `scenarioId` must match the folder name. Copy `stage-a-smoke` and choose a seed, clock, site/worker counts, and `referencePack`.
2. `modules.contracts: true` requires `generatorVersion: 2`; `modules.expenses: true` requires version 3; `modules.time: true` requires version 4; `modules.projects: true` requires version 5 with time and expenses; `modules.reconciliation: true` requires version 6 with projects. Version 7 adds a complete two-site August showcase month. Other unsupported modules still fail validation before any database write. `cases` describe planned journey coverage and do not themselves create business facts.
3. Run generate, assert, presenter, reset and regenerate locally. Add an assertion for each new module's source-backed totals when its adapter lands.
4. Bump `schemaVersion` or `generatorVersion` when changing the meaning of IDs or generated facts. Do not make application code read `fixtures/generated`.

Zod validates the manifest and reference pack. SHA-256-derived UUIDv5-shaped IDs depend on scenario ID and entity path. The run ID also includes the seed; identity IDs stay stable between seeds while the seeded generator changes variable facts such as site assignments. The same inputs and code produce byte-equivalent expected manifests.

## Registry and reset boundary

### Gate A post-UAT cleanup of the hosted 20260926 run

Issue [#103](https://github.com/niru2015/cleanops-ai/issues/103) has a one-run cleanup runner at
`scripts/demo-uat-cleanup.mjs`. Its input is the reviewed, ignored
`artifacts/tornado-demo/gate-a/hosted-uat-cleanup-manifest.json`, accompanied by the ignored full
database snapshot, 94-table fingerprints, storage inventory and private-object backups in the same
artifact folder. The current manifest selects 213 UAT-added rows in 33 tables and six backed-up
private objects; it left 445 generator rows for the existing scenario reset. The exact cleanup,
registered reset, alternate-seed `20260927` generate/assert and unrelated-tenant isolation check
passed on 2026-09-25 UTC. The current hosted run is `cf17ee03-dfe7-59f6-8d18-faf51007d919`.
Never commit these
audit files or private bytes. Any further phone/browser UAT write invalidates the manifest and
requires a fresh inventory, review and manifest hash in the runner.

Run `node scripts/demo-uat-cleanup.mjs dry-run artifacts/tornado-demo/gate-a/hosted-uat-cleanup-manifest.json`
first. It verifies the exact hosted project, organization, run, source hashes, all organization
table fingerprints and storage object IDs, then attempts the exact-ID dependency-order deletions
inside a serializable transaction that rolls back. It never uses `session_replication_role`.
The apply mode requires the reviewed run ID in `CLEANOPS_GATE_A_CLEANUP_APPROVED_RUN_ID` and
`apply` instead of `dry-run`; it commits the same guarded transaction, then removes only the six
listed storage objects. A storage-removal failure after commit requires reconciliation from the
ignored backup. The script takes short locks on the affected tables while it temporarily disables
named immutable/provenance triggers within its transaction, restores them before commit and
aborts if any count, source or object has drifted.

After separately reviewing the hosted reset, the operator reran `reset-preflight`, then the existing
hosted `reset --apply`, alternate-seed `preflight`, `generate --apply` and `assert` commands above.
The read-only manifest and ignored command logs remain the audit evidence. A future reset must
repeat its own preflight and approval for the active registered run.

`fixtures/generated/<scenario-id>/registry.json` is a local, ignored service-tooling registry. It records the run, seed, generator version, organization ID, status and created Auth IDs. The scenario plan contains every base entity ID; the registry is written before database insertion and marked `partial` on failure. A partial run can be reset and regenerated. Reset checks the organization slug and planned base IDs, refuses deletion when the generated organization has unrelated operational/finance records, deletes only scenario-owned records, and removes only Auth users tagged with the scenario ID. Other tenant and legacy seed IDs are untouched. The contract adapter scopes source and generated rows by deterministic IDs or generated version links, reconciles current expected revenue, and deletes those rows in dependency order. Later adapters must extend the same preflight before writing more entities.

`expected.json` contains the scenario version, seed, clock, source-backed entity counts, role/site matrix and explicit control totals. For `finance-showcase` it includes current expected contract revenue, approved operational expense cost and approved labour cost, excluding deliberate duplicate-receipt and time exceptions. Its reconciliation section records a review-required June, a closed July and the late-import stale signal. It is for assertions and demos only. The app never imports it. `demo:assert` queries the local database and fails if generated records or totals differ. `presenter-tests.md` is generated from the same plan and states which later journeys are not available.

## Reference names and privacy

`fictional-v1` is the default for tests. `tornado-v1` separates owner-approved display identities from generated IDs and transaction values: Grand Villa (already named in this repository), [River Rock Casino Resort](https://riverrock.com/), and [Parq Casino Vancouver](https://www.parqcasino.com/) are venue references. Equipment reference names are drawn from `supabase/seed.sql`. The named personas are demo display identities from issue #28 and `scripts/provision-demo-logins.mjs`. These references imply no customer relationship, employment facts, actual contract or measured performance. All generated business records remain synthetic, per ADR 008.

The fourth finance-showcase site currently uses a fictional fallback until the owner supplies another approved hosted venue name. Site names are display data only; no ID, authorization rule or assertion depends on their literal wording.

## Stage B boundary

Contract manual setup/activation (#35) is the first attached adapter. CLEAN-034 adds synthetic `contract-source.pdf`, `contract-amendment.pdf`, `contract-scan.png` and `contract-documents.json` with exact source expectations. CLEAN-035 adds `expense-receipts.json`, synthetic PNG receipts and presenter copy/paste messages to `finance-showcase`; it replays app/normalized WhatsApp intake, human resolution and Director approval through production RPCs. The deliberate duplicate reuses a receipt hash and must not add cost. CLEAN-036 adds `time-cases.json` and replays attendance derivation, explicit review, effective rate changes and Director cost posting. CLEAN-037 derives project quote, recognized revenue and direct contribution from the seeded plan and verifies them against posted sources. CLEAN-038 creates accounting source rows and period states under deterministic IDs, runs unique matching through the Director RPC, and verifies ambiguity and stale close through read RPCs. Reset removes scenario period, link and accounting rows after a registry preflight. `demo:assert` checks source hashes, posted counts and totals. The local-only reset uses a transaction-scoped replication role to remove immutable time/rate/cost rows without weakening application triggers. These files are synthetic and are not silently attached to an existing active version. Supplies (#30), equipment (#31) and other adapters follow their owning schemas/services. The full 10–15 minute finance showcase remains incomplete.
