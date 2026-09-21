# Security baseline

## Authorization matrix

All roles require active organization membership; site-scoped roles also need site grants.

| Role | Allowed scope |
|---|---|
| Cleaner | Own assigned work, own uploads/reports; no peer private records or approvals |
| Site supervisor | Granted sites; resolve evidence, review quality, manage local actions |
| Area manager | Explicitly granted sites; same review rights and aggregate reporting; read-only finance for granted sites |
| Operations manager | Organization operations; no other tenant; no finance access |
| Organization administrator | Membership/integration configuration and organization operations; the only role that writes finance records |
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

CLEAN-009 keeps the Meta app secret, access token, verify token and internal worker token in
server-only environment variables. POST verifies `X-Hub-Signature-256` over the exact raw bytes;
GET compares the subscription token without ordinary string equality. Receiving phone number maps
to the tenant in the database. Media uses bearer-authenticated Graph requests, an HTTPS host
allowlist, a 10 MiB ceiling and the existing content-signature checks. Official ingress, outbox,
delivery and queue-health RPCs are service-role only. Free-form sends require a current conversation
window and all sends require a consent reference plus a verified account-scoped recipient.

CLEAN-004 configures a private `operational-evidence` bucket with a 10 MiB limit and JPEG, PNG
and WebP allowlist. The service checks the file signature, size and SHA-256 before finalization.
Authenticated callers can see Storage metadata only when the linked evidence row is visible;
the signed-URL route repeats that RLS check and uses a 60-second expiry. Cleaners see their own
linked evidence, supervisors see granted sites, and unresolved records never reach clients.

CLEAN-005 review tables are read-only through RLS for authorized supervisors and managers.
Mutations use narrowly granted RPCs that resolve the actor server-side, check active role plus
site access and lock the task row before comparing revisions. Cleaners and client viewers cannot
approve; AI output is service-written and an approved revision is final.

CLEAN-006 coverage, task-assignment and replacement records use organization and site-scoped
foreign keys plus RLS. Supervisors can see and select replacements only at managed sites; cleaners
can read only their assigned mobile task. The coverage function checks shift access and counts only
distinct assigned workers with active site permission and a latest check-in at the requested time.
Creating QR context does not create an attendance event.

CLEAN-011 authorizes the cleaner and assigned task before issuing a one-object signed upload token.
The browser uploads directly to the private bucket so phone images do not pass through the Vercel
function body. A short-lived HMAC ticket binds finalization to the authenticated actor and staged
evidence. Finalization reloads the private object, checks JPEG/PNG/WebP content signatures, size and
SHA-256 against the staged metadata, and only then links evidence through the existing deterministic
context service. The Supabase secret and signing key remain server-only.

CLEAN-007 keeps incident statements, evidence links, equipment records and reporting audit events
inside operational roles with managed-site access. A client sees no draft. Explicit release creates
an immutable audience record, and the client export function checks active `client_viewer`
membership plus an active grant to that site before returning a redacted snapshot. Tests cover
guessed IDs, another site in the same tenant, another tenant and private-original denial.

CLEAN-027 and the role-scoped demo migration (`20260921051826`) protect finance and equipment data.
`inventory_transactions` and `labor_cost_entries` can be read only by an organization administrator or an area
manager with an active grant to the site (`private.can_view_site_finance`) and inserted only by an organization
administrator (`private.can_edit_site_finance`); site supervisors and operations managers have no finance ledger access.
Browser roles currently hold only `select, insert` on both ledgers, which is what makes them append-only; the `update` and
`delete` policies created for administrators have no grant behind them and do nothing today. The owner decided to grant Directors update and delete (issue #48); this paragraph changes when that migration lands. Supplier and inventory item catalogues are readable only by Directors, Area Managers and Operations Managers (`private.can_view_supply_catalogue`) and writable only by Directors (`private.can_edit_supply_catalogue`). `equipment_models` is
readable by every active member and writable by administrators; `equipment_assets` is readable with operational
site access. Both are select-only for browser roles. Raw `external_messages` remain service-only and reach
supervisors only through `list_site_external_messages`.

## Evidence privacy and pilot decisions

Use synthetic people and media in demos; real casino names are allowed only as reference data under ADR 008. Casino images may contain patrons, staff,
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
