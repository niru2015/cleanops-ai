-- CLEAN-028: let Directors correct or remove inventory/labour ledger rows.
--
-- 20260921051826 already created Director-scoped update/delete RLS policies for
-- both ledgers, but 20260921002737 only granted `select, insert` to `authenticated`,
-- so the policies were inert. This migration adds the grant, blocks reassigning a
-- row's organization/site/id (RLS `with check` alone cannot compare old vs new, so
-- a trigger is required), and records every update/delete in a dedicated,
-- finance-scoped audit table.
--
-- `total_cost` on both tables is `generated always as (...) stored`, so Postgres
-- already rejects any attempt to write it directly; no extra guard is needed for
-- that half of "restrict updatable columns".
--
-- A finance-scoped table (rather than reusing `reporting_audit_events`) is used
-- deliberately: that table's existing select policy uses `can_manage_site`, which
-- also admits site supervisors and operations managers — neither of whom can read
-- the finance ledgers themselves. Reusing it would leak ledger edit history to
-- roles that cannot see the ledger. This table's select policy instead matches the
-- ledgers' own read rule.

create table public.finance_ledger_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  ledger text not null check (ledger in ('inventory_transaction', 'labor_cost_entry')),
  record_id uuid not null,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action in ('update', 'delete')),
  before jsonb not null check (jsonb_typeof(before) = 'object'),
  after jsonb check (after is null or jsonb_typeof(after) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, site_id)
    references public.sites (organization_id, id) on delete cascade,
  check ((action = 'update') = (after is not null))
);

create index finance_ledger_audit_events_record_idx
  on public.finance_ledger_audit_events (organization_id, ledger, record_id);

alter table public.finance_ledger_audit_events enable row level security;

-- Read-only to the app: rows are written exclusively by the trigger below, running
-- as its owning role, not by any client-facing grant.
grant select on table public.finance_ledger_audit_events to authenticated;
grant all on table public.finance_ledger_audit_events to service_role;

create policy finance_ledger_audit_events_select
on public.finance_ledger_audit_events
for select
to authenticated
using (private.can_view_site_finance(organization_id, site_id));

create function private.log_finance_ledger_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger text := tg_argv[0];
  v_actor uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id
       or new.site_id <> old.site_id
       or new.id <> old.id then
      raise exception using errcode = '42501',
        message = 'organization_id, site_id and id cannot be changed on this ledger';
    end if;
    -- v_actor is null for privileged service-role callers with no end-user session
    -- (e.g. reset_hosted_demo's bulk deletes). Those are not Director edits and are
    -- deliberately left unaudited here rather than failing the caller or recording
    -- a misleading actor.
    if v_actor is not null then
      insert into public.finance_ledger_audit_events (
        organization_id, site_id, ledger, record_id, actor_user_id, action, before, after
      ) values (
        old.organization_id, old.site_id, v_ledger, old.id, v_actor, 'update',
        to_jsonb(old), to_jsonb(new)
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if v_actor is not null then
      insert into public.finance_ledger_audit_events (
        organization_id, site_id, ledger, record_id, actor_user_id, action, before, after
      ) values (
        old.organization_id, old.site_id, v_ledger, old.id, v_actor, 'delete',
        to_jsonb(old), null
      );
    end if;
    return old;
  end if;
  return null;
end;
$$;

revoke execute on function private.log_finance_ledger_change() from public, anon, authenticated;

create trigger inventory_transactions_audit
before update or delete on public.inventory_transactions
for each row execute function private.log_finance_ledger_change('inventory_transaction');

create trigger labor_cost_entries_audit
before update or delete on public.labor_cost_entries
for each row execute function private.log_finance_ledger_change('labor_cost_entry');

-- The actual grant this issue asked for. RLS (labor_cost_entries_update/_delete,
-- inventory_transactions_update/_delete from 20260921051826) already restricts
-- both to Directors via private.can_edit_site_finance.
grant update, delete on table public.inventory_transactions, public.labor_cost_entries to authenticated;
