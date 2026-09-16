# CLEAN-010 — Secure hosted demo access

Status: implementation in progress. GitHub issue: #20.

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

## Next step

Finish implementation and tests, provision temporary Auth credentials, deploy, verify each role,
then move this plan to `completed/` with the final revision and deployment evidence.
