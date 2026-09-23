# ADR 012: Approved time and effective worker cost

Status: Accepted, 2026-09-23.

## Context

Issue #64 needs operational shift and project hours to feed finance without giving operational reviewers confidential worker cost rates. Attendance can be incomplete or corrected. Existing `labor_cost_entries` allowed direct Director adjustments but had no approved-time provenance. Payroll and accounting period close are separate work.

## Decision

Store site-scoped `time_entries` and immutable review events separately from Director-only, effective-dated `worker_cost_rates` and rate events. Attendance derivation is deterministic and idempotent per assignment. A missing endpoint, invalid duration or cancelled assignment becomes a review exception. A reviewer explicitly approves actual hours and cost class; duration does not imply overtime. A Director posts once through an RPC that finds the single effective CAD rate for the site's local work date and snapshots hours/rate into the existing cost ledger. Linked cost is immutable. The existing direct ledger form remains an explicitly labelled adjustment path. Contract and project references preserve attribution for #65/#66.

## Alternatives

- Automatically costing check-in/out would turn incomplete attendance into approved expense.
- Showing rates in an operational view would expose confidential worker cost to site reviewers.
- Recomputing past cost after a rate change would rewrite approved historical snapshots.

## Consequences and revisit trigger

Rate changes require a reason and cannot overlap; missing rates block posting while leaving approved hours intact. Non-CAD rates await conversion policy. The scenario factory includes synthetic rate changes, exceptions and a manual project, with no payroll deductions or customer data. Revisit when #65 adds canonical jobs and #66 owns cost reconciliation and close.
