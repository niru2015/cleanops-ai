# Golden demo: Sunday Casino Night Shift

Synthetic organization “Demo Cleaning Co”; fictional “Pacific Crown Casino”, Restroom B
and Slot Bank 14. Never imply a real Tornado deployment or real measured performance.
Second tenant “Isolation Test Co” exists for tests, not a demo customer.
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
P3 adds surrounding UI and records. Deferred capabilities are clearly labeled previews,
not working buttons or fake completed outcomes. PWA and simulator invoke shared services.

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
