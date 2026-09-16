# ADR 006 — Released client report snapshots

Status: accepted 2026-09-16.

## Context

Client viewers need stable proof of a reviewed reporting window without access to worker
statements, private evidence or mutable internal operational records.

## Decision

Calculate each report from a versioned SLA definition and persisted task-run results, round the
rate once when the draft is prepared, and store a redacted snapshot. A supervisor or manager must
create a separate audited release record. Client access requires an active `client_viewer`
membership and an active grant for the report site; the export function returns only snapshot
fields after both checks.

## Alternatives

- Live client queries over operational tables were rejected because later edits could change a
  previously reviewed report and would expand access to private data.
- Automatic publication at shift end was rejected because release is a consequential human action.

## Consequences

Released reports are stable and easy to test across tenant/site boundaries. Correcting a released
report requires a later version rather than editing the snapshot; that versioning workflow is
deferred until a real contract and correction policy exist.

Revisit when contract reporting rules, report corrections or multi-site client portfolios are
approved for a pilot.
