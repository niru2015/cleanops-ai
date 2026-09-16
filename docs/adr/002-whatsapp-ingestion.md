# 002 — Official WhatsApp behind a channel adapter

Status: accepted and implemented by CLEAN-009. Date: 2026-09-14.

## Decision

Use the official Business API target; simulate legacy groups through a clearly labeled adapter. Both feed shared domain services.

## Alternatives and rationale

Coupling business logic to group scraping introduces an unverified production dependency.

## Consequences

Dedicated-number onboarding changes some interaction; arbitrary existing group access is not promised.

## Revisit when

Verified customer account capabilities justify a separate supported connector.
