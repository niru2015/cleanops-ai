# Golden demo: Sunday Casino Night Shift

The new deterministic scenario factory is documented in [DATA_FACTORY](demo/DATA_FACTORY.md).
Its Stage A packs generate base sites, workers and personas locally; they do not yet replace this
legacy night-shift seed or create finance outcomes.

Synthetic organization “Demo Nightshift Services” (`supabase/seed.sql`); fictional client “Aurora Casino Demo”,
site “Aurora Downtown Demo”, Restroom B and Slot Bank 14. Never imply a real Tornado deployment or real measured
performance. Second tenant “Demo Harbour Facilities” exists for isolation tests, not as a demo customer. The hosted
casino demo below presents the same walkthrough site as “Grand Villa”; those hosted names are not in the repository seed.
All screens display “Prototype • synthetic data”; suggestions display “Mock AI” until live.

Seed clock: Sunday 2026-09-13 22:00 through Monday 2026-09-14 06:00 America/Vancouver.
Use stable fixture IDs and a reset action scoped to the demo tenant; no destructive global reset.

| Local time | Event | Expected visible behavior |
|---|---|---|
| 22:45 | 42 positions required, 40 present | Coverage gap 2, amber |
| 22:51 | Supervisor selects eligible replacement | Suggestion is mock; explicit assignment |
| 23:05 | Replacement checks in | 41 present, gap 1 remains |
| 23:10 | Second replacement checks in | 42 present, gap 0 (added to reconcile source scenario) |
| 23:15 | Worker 182 sends BEFORE, Restroom B | Private evidence linked to scheduled task |
| 23:29 | AFTER arrives | Pair shown; submitted, pending review |
| 23:30 | Mock score 86; possible mirror streak | Supervisor confirms finding and opens correction |
| 23:34 | Corrected AFTER arrives; mock score 96 | New submission; supervisor approves it explicitly |
| 00:17 | Reported scratch by Slot Bank 14 | Attributed worker statement, incident timeline; no blame |
| 02:05 | Scrubber pulling right report | Equipment intake; no fabricated completed repair |
| 06:00 | Shift report released by supervisor | SLA and approved evidence; client redacted view |

## Phased demo

P2 implements only the 23:15–23:34 evidence/review slice, plus unresolved/duplicate/error cases.
CLEAN-004 supplies the durable 23:15 BEFORE, 23:29 AFTER and revision/pair foundation; quality
scoring, findings, correction decisions and approval remain CLEAN-005.

CLEAN-005 implements the 23:30–23:34 review slice at `/review`: Mock AI score 86 remains a
suggestion until confirmation, correction creates revision 2, score 96 remains advisory and a
supervisor explicitly approves. The history survives reload; a simulated mock failure remains
manually reviewable.
CLEAN-006 implements the 22:45–23:10 staffing sequence at `/operations` and the connected
Slot Bank 14 mobile capture at `/mobile`. Coverage begins at 40/42 and changes only after the
supervisor selects each eligible replacement and a distinct attendance check-in is recorded.
The mobile QR chooses the zone/task context without changing attendance. CLEAN-011 lets the
cleaner take a phone photo or choose an existing JPEG, PNG or WebP image up to 10 MiB. The actual
selected bytes upload privately and run through the shared evidence pipeline; interrupted uploads
remain retryable.
P3 adds surrounding UI and records. Deferred capabilities are clearly labeled previews,
not working buttons or fake completed outcomes. PWA and simulator invoke shared services.

CLEAN-007 implements the 00:17 and 02:05 records at `/incidents`, including attributed wording,
an audited correction and an equipment state that remains `reported`. `/reports` computes the
versioned 149/150 fixture, keeps it private as a draft and requires supervisor release.
`/reports/client` returns only the released redacted snapshot to the site-authorized demo viewer.

## Metric fixtures

For the final P3 report seed 150 due required task runs, 149 approved on time and 1 missed:
149 / 150 × 100 = 99.3% rounded. One corrected quality issue, one documented incident,
one equipment report. Initial P2 reports only its actual task counts, not 99.3%.
Safety is N/A until safety schedules/checks are implemented; never show 0 overdue without them.

## Walkthrough acceptance

Replay fixtures → see processing state → open pair → confirm finding → submit correction →
approve latest version → see audit history → release report → sign in as client and confirm
restricted view. Reload preserves state; replay does not double-count evidence or SLA.
Unknown sender can be resolved; missing media/AI failure remains reviewable; tenant B sees none
of tenant A. Check small-screen photo/review layout and keyboard navigation.

## Hosted access

CLEAN-010 adds a production-safe login for temporary synthetic supervisor, cleaner and client
accounts. `CLEANOPS_HOSTED_DEMO_ENABLED=true` permits synthetic walkthrough actions only after the
server verifies the expected role and active Aurora Downtown site grant. The production
`/api/demo/*` routes remain unavailable; WhatsApp and live OpenAI remain disabled.
The supervisor can reset synthetic staffing, evidence, review, incident and report changes from
`/operations`; the service-only database function cannot be invoked by a browser session.
In production mode, the `/review` Prepare submission and correction fixture actions run as
server-only, site-scoped commands for authorized demo supervisors. They use the same durable
ingress and evidence services as local fixtures, stage labelled synthetic images, and record
start/outcome in `hosted_demo_fixture_audit`. The reset uses the same operation lease, so
simultaneous preparation and reset receives a conflict response. Only the two enumerated
walkthrough task runs can leave an approved state during reset. Storage cleanup removes paths
returned by that site-scoped reset; a Storage failure is shown as a partial reset.

The presenter supplies one rotated temporary password. CLEAN-010 defined these three reserved accounts; the login
selector now uses the named personas in the next section, and no script in this repository creates the accounts below,
so confirm they still exist before relying on them:

- (CLEAN-010, legacy) `demo-supervisor@cleanops.example.com` → operations, evidence review, incidents and report release
- `demo-cleaner@cleanops.example.com` → assigned mobile task and real camera/library upload using synthetic demo content
- `demo-client@cleanops.example.com` → released redacted client report

Rotate the shared password after external presentations. Do not add customer emails or real casino
records to the synthetic tenant.


## BC casino role demo

The hosted BC casino demo uses real casino and commercial-equipment names as reference/demo data only.
No customer or service relationship is implied. Personnel names are demo display identities.

> Owner decision 2026-09-21 ([ADR 008](adr/008-real-casino-names-public-repo.md)): real names stay, as reference data only. The casino records are still not in `supabase/seed.sql` or any migration; making them reproducible is tracked in issue #28.

Access rules:

- Directors: organization-wide navigation and casino access; finance view/edit.
- Area Managers: assigned casinos only; finance view is read-only.
- Operations Managers: organization-wide operational access; no finance page.
- Supervisors: assigned operational casinos; no finance page.
- Cleaners: assigned cleaner workflow only; no finance page.
- Client viewer: released client-report view only.

The operations landing page is database-backed for every casino assigned to the signed-in role. It
shows all accessible sites, areas, task/run counts, eligible-worker counts, equipment assets and
equipment issue reports. The interactive Sunday-night walkthrough remains an additional Grand Villa
scenario when that site is within the account's access scope.

Named hosted personas are provisioned with `npm run demo:provision-logins`.
Set `CLEANOPS_DEMO_PASSWORD` in the local/server environment before running the command.
The script uses Supabase Admin Auth to create/rotate confirmed email/password identities and keeps
the public membership and worker links synchronized. Never commit the demo password.
