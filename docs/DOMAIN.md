# Domain and rules

| Term | Meaning |
|---|---|
| Organization | Cleaning contractor tenant |
| Membership | Auth user role within an organization; distinct from worker record |
| Client / Site / Zone | Customer → physical facility → serviceable area |
| Worker | Person performing work, optionally linked to an authenticated user |
| ServiceTask | Reusable definition of work and evidence requirements |
| TaskSchedule | Recurrence in the site's time zone |
| TaskRun | One scheduled occurrence with frozen requirements and due time |
| Shift / Assignment | Time window / worker allocated to it |
| AttendanceEvent | Reported check-in/out with source; not proof of location |
| Evidence | Immutable original media plus provenance; linked to a work record |
| Inspection | Human review of a particular submitted evidence revision |
| QualityFinding | Suggested or confirmed deficiency |
| CorrectiveAction | Required follow-up, linked to finding and task run |
| Incident | Reported event and attributed statements; no implied cause/blame |
| SLA | Versioned measurable service obligation and calculation window |

## Canonical states

TaskRun: `scheduled → assigned → in_progress → submitted → approved`.
Supervisor may move `submitted → correction_required → submitted`; approval requires
review of the latest submission and required evidence. Cancellation requires supervisor
reason; preserve history. Evidence arrival alone cannot approve a task. AI results are
separate records, never an `AI verified` task state. Corrected photos create a new
submission revision; stale approvals/AI responses cannot approve the new revision.

Evidence processing: `received → ready` or `quarantined`; then linkage is `unresolved`
or `linked`. Explicit before/after labels classify role, not identity or task ownership.
Finding: `suggested → confirmed|dismissed`; confirmed findings can have an action.
Action: `open → in_progress → submitted → closed`; supervisor closes after review.
Incident: `reported → triaged → action_required → resolved → closed`; supervisor may
triage directly to resolved with a reason. Client release is a separate audited action.

## Resolution

Verified sender mapping → authorized active assignment → explicit QR/zone/task context →
unexpired conversation context. Ambiguous candidates go to review. Never use timestamps
alone to join tasks. Demo context TTL: 30 minutes, scoped by account/thread/sender/shift;
expire on shift end or explicit switch. QR identifies a zone, not a worker or attendance.

## Time and metrics

Store UTC instants; display and schedule in site IANA time zone, initially America/Vancouver.
Snapshot run deadlines; test overnight shifts and DST gaps/overlaps before recurring schedules.
Coverage = required positions minus distinct present, eligible assigned workers; clamp at zero.
Eligibility is a configured site rule reviewed by an authorized person, not AI/legal advice.
SLA completion = approved-on-time required runs / due required runs × 100, rounded to 1 decimal.
Zero denominator displays N/A. Late approvals remain late. Canceled runs leave the denominator
only with a recorded contractual exclusion reason. Report exclusions and time window.
Safety “zero overdue” requires scheduled checks and records; no configured checks means N/A.
