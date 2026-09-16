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

Membership revocation is database-backed in CLEAN-002: every policy helper checks the active
membership row on each statement. Revocation therefore applies on the next database statement,
even when the caller still holds an otherwise valid access token. Auth session revocation remains
a separate control for ending all non-database access and must be added before a real pilot.

## Required controls

- Enable RLS and minimal grants together on exposed tables; default deny anonymous access.
- Enforce update old-row access and new-row tenant/site validity. Review views/functions too.
- Private media buckets; authorize each signed-URL request, short expiry, no public originals.
- Verify webhook signatures on original bytes; isolate simulator authorization from live ingress.
- Validate file type by content, size and allowed origin; quarantine bad/unsupported media.
- Keep secrets server-side, redact logs and audit changes without duplicating sensitive payloads.
- Messages, OCR and retrieved documents cannot alter system instructions or trigger tools.
- Do not cache private responses across users/tenants; scope realtime subscriptions and exports.

CLEAN-003 simulator access uses a server-only bearer token with a minimum length, explicit
enable flag and body limits. Both simulator routes return `404` when disabled and are forced
off under `NODE_ENV=production`. The privileged Supabase secret is loaded only after this gate;
integration tables and RPCs grant access only to `service_role`.

CLEAN-004 configures a private `operational-evidence` bucket with a 10 MiB limit and JPEG, PNG
and WebP allowlist. The service checks the file signature, size and SHA-256 before finalization.
Authenticated callers can see Storage metadata only when the linked evidence row is visible;
the signed-URL route repeats that RLS check and uses a 60-second expiry. Cleaners see their own
linked evidence, supervisors see granted sites, and unresolved records never reach clients.

CLEAN-005 review tables are read-only through RLS for authorized supervisors and managers.
Mutations use narrowly granted RPCs that resolve the actor server-side, check active role plus
site access and lock the task row before comparing revisions. Cleaners and client viewers cannot
approve; AI output is service-written and an approved revision is final.

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
