# Security baseline

## Authorization matrix

All roles require active organization membership; site-scoped roles also need site grants.

| Role | Allowed scope |
|---|---|
| Cleaner | Own assigned work, own uploads/reports; no peer private records or approvals |
| Site supervisor | Granted sites; resolve evidence, review quality, manage local actions |
| Area manager | Explicitly granted sites; same review rights and aggregate reporting |
| Operations manager | Organization operations; no other tenant |
| Organization administrator | Membership/integration configuration and organization operations |
| Client viewer | Explicit client/site grants; released, redacted reports only |

Database policies enforce access independently of UI. Never authorize from an editable
profile field or a client-supplied organization ID. Privileged workers resolve account →
tenant from trusted configuration and validate all references because they can bypass RLS.
Cleaner self-approval is prohibited. Client release is a deliberate supervisor/manager action.

## Required controls

- Enable RLS and minimal grants together on exposed tables; default deny anonymous access.
- Enforce update old-row access and new-row tenant/site validity. Review views/functions too.
- Private media buckets; authorize each signed-URL request, short expiry, no public originals.
- Verify webhook signatures on original bytes; isolate simulator authorization from live ingress.
- Validate file type by content, size and allowed origin; quarantine bad/unsupported media.
- Keep secrets server-side, redact logs and audit changes without duplicating sensitive payloads.
- Messages, OCR and retrieved documents cannot alter system instructions or trigger tools.
- Do not cache private responses across users/tenants; scope realtime subscriptions and exports.

## Evidence privacy and pilot decisions

Use synthetic people/sites/media in demos. Casino images may contain patrons, staff,
screens or sensitive operational details; minimize capture, restrict originals and use
reviewed/redacted derivatives before AI or client release. No face recognition or background
location collection. Original hashes establish file consistency, not truth or causation.
Before real data: owner sets approved capture zones, notices/permissions, retention for raw
messages/media/AI/audit/backups, hosting region, deletion/hold process and incident contact.
These are unresolved deployment requirements, not claims of legal compliance.

## Release tests

Two organizations, two differently granted sites within one organization, each role and
anonymous access. Exercise reads/inserts/updates/deletes, guessed IDs, reassignment, Storage,
views/RPCs, exports and live subscriptions. Verify membership revocation and pending signed
URL exposure window. Test forged webhooks, replay, malicious text, rejected media and stale
approval race. Production remains gated until applicable tests and privacy decisions pass.
