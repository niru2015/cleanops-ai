# Product boundary

## Problem and outcome

Messages and photos demonstrate activity but are difficult to connect to a worker,
site, task and approved service result. CleanOps makes that chain searchable and auditable
while supporting WhatsApp and a mobile PWA as alternative input channels.

Buyer: cleaning contractor operations management. Users: cleaner, site supervisor,
area manager, operations manager, client viewer and organization administrator.
The contractor is the tenant; the casino is its client, not automatically a tenant.

## First deliverable (P1–P2)

One site, multiple zones; two tenant fixtures for isolation testing. Authenticated roles;
scheduled task runs; simulated inbound messages and private image evidence; deterministic
worker/context resolution; before/after pairing; mock AI suggestion; supervisor correction
and approval. A reload preserves progress. The simulator uses the real domain pipeline.

## Connected MVP (P3)

Command center → site zones → cleaner mobile capture → quality review/correction →
incident timeline → restricted client service report. Staffing/attendance and basic
eligibility indicators support the demo; replacement suggestions require human assignment.
Equipment reports and supply requests are simple intake records, not maintenance/stock systems.

## Success / acceptance

- A seeded before/after pair reaches the correct task and reviewer without re-entry.
- Unknown identities and ambiguous context enter a resolvable queue; no guessed assignment.
- Duplicate/retried delivery produces one message and one set of downstream effects.
- AI failure leaves the human workflow usable; a suggestion never equals approval.
- Approved service results have evidence, actor/time provenance and auditable corrections.
- Client sees only released records for authorized sites; tenant isolation tests pass.

## Later capabilities

Real OpenAI and official WhatsApp adapters, multisite operations, contract extraction,
SOP retrieval, worker training/eligibility workflows, lone-worker escalation, equipment
maintenance, inventory, SLA risk and contract profitability. Add only through roadmap issues.

## Non-goals

Payroll, accounting, full HRIS, automatic discipline, facial recognition, continuous
surveillance, autonomous worker assignment, casino surveillance-system integration,
unofficial WhatsApp scraping and claims that photos certify hygiene or prove causation.
No production-grade emergency response or compliance certification in the prototype.

## UX requirements

Mobile-first, plain language, accessible labels, visible upload/retry states, explicit
AI-assisted labels and useful empty/error states. Persist before showing “recorded”.
Show submitted, pending review and approved distinctly. Demo banners survive navigation.
