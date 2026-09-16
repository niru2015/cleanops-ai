# CLEAN-010 — Secure hosted demo access

Status: complete. GitHub issue: #20. Pull request: #21.

## Outcome

Allow invited business reviewers to use the hosted synthetic workflow through three temporary,
role-scoped Supabase Auth accounts. Keep production simulator APIs and live providers disabled.

## Read

- `docs/DEMO.md`
- `docs/SECURITY.md`
- `docs/integrations/SUPABASE.md`
- Existing runtime services, protected pages and RLS policies

## Acceptance

- Cookie-bound email/password sign-in and sign-out work in the hosted app.
- Supervisor, cleaner and client accounts reach only their role-specific synthetic site workflow.
- Hosted synthetic mutations require an explicit server flag, an authenticated session, the
  expected role and an active Aurora Downtown site grant before privileged demo services run.
- A supervisor can restore shared synthetic workflow records and private evidence objects without
  affecting another organization or exposing the reset RPC to browser-authenticated roles.
- `/api/demo/*`, WhatsApp and live OpenAI remain disabled in production.
- Invalid credentials disclose no account details.
- Typecheck, lint, unit, build, database isolation and hosted browser checks pass.

## Changed paths

- `src/app/login`, `src/components/login-form.tsx`, `src/components/app-shell.tsx`
- `src/services/hosted-demo.ts` and role-specific runtime services
- Protected workflow pages and synthetic actions
- `.env.example`, `docs/DEMO.md`, `docs/plans/ROADMAP.md`

## Verification

- Revision `5215d5c` passed `typecheck`, lint, 38 unit tests, build and the PostgreSQL migration,
  isolation and reset suite.
- Supabase migration `20260916192408_hosted_demo_reset.sql` is applied to project
  `jfhpbabelqldhemrmvgc`; service-role reset passed and authenticated direct RPC returned `42501`.
- Vercel deployment `dpl_49Qfytf4oHztPYBPH4QW5G9dsYVo` reached Ready and is aliased to
  `https://cleanops-ai.vercel.app`.
- Production browser checks passed for all three roles, cross-role denial and reset. Production
  `/api/demo/messages` and `/api/webhooks/whatsapp` both returned `404`.
