begin;
set local search_path = public, extensions;
select plan(15);

select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'public.finance_ledger_audit_events'::regclass $$,
  array[true],
  'finance ledger audit events enforce RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.finance_ledger_audit_events', 'insert'),
  'authenticated cannot insert audit rows directly'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

create temporary table director_vendor as
  select id from public.vendors where organization_id = '10000000-0000-4000-8000-000000000001' order by name limit 1;
create temporary table director_item as
  select id from public.inventory_items where organization_id = '10000000-0000-4000-8000-000000000001' order by name limit 1;

create temporary table inv_row as
  with ins as (
    insert into public.inventory_transactions (
      organization_id, site_id, vendor_id, inventory_item_id, transaction_type, quantity, unit_cost, occurred_at
    ) values (
      '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
      (select id from director_vendor), (select id from director_item), 'receipt', 2, 7.50, now()
    ) returning id
  )
  select id from ins;

create temporary table lab_row as
  with ins as (
    insert into public.labor_cost_entries (
      organization_id, site_id, work_date, hours, hourly_cost, cost_type
    ) values (
      '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
      current_date, 2, 24.50, 'regular'
    ) returning id
  )
  select id from ins;

update public.inventory_transactions set quantity = 4 where id = (select id from inv_row);
select is(
  (select total_cost from public.inventory_transactions where id = (select id from inv_row)),
  30.00::numeric,
  'Director update recalculates inventory total_cost in the database'
);
select is(
  (select count(*) from public.finance_ledger_audit_events
    where ledger = 'inventory_transaction' and record_id = (select id from inv_row) and action = 'update'
      and actor_user_id = '00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Director update is attributed and audited'
);

select throws_ok(
  $$ update public.inventory_transactions set total_cost = 999.00 where id = (select id from inv_row) $$,
  '428C9',
  null,
  'total_cost cannot be written directly (generated column)'
);
select throws_ok(
  $$ update public.inventory_transactions set site_id = '40000000-0000-4000-8000-000000000002' where id = (select id from inv_row) $$,
  '42501',
  'organization_id, site_id and id cannot be changed on this ledger',
  'Director cannot reassign an inventory transaction to another site'
);

delete from public.labor_cost_entries where id = (select id from lab_row);
select is(
  (select count(*) from public.labor_cost_entries where id = (select id from lab_row)),
  0::bigint,
  'Director delete removes the labour cost entry'
);
select is(
  (select count(*) from public.finance_ledger_audit_events
    where ledger = 'labor_cost_entry' and record_id = (select id from lab_row) and action = 'delete'
      and actor_user_id = '00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Director delete is attributed and audited'
);

-- Area Manager: granted to site ...002, not ...001 where inv_row lives, so she has
-- no read access to it either. Attempt the writes as her (RLS hides the row from
-- her own UPDATE/DELETE entirely, so these affect 0 rows), then verify the outcome
-- from a role that can actually see the data, not through her own blinded view.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
update public.inventory_transactions set quantity = 999 where id = (select id from inv_row);
delete from public.inventory_transactions where id = (select id from inv_row);
select is(
  (select count(*) from public.finance_ledger_audit_events where record_id = (select id from inv_row)),
  0::bigint,
  'Area Manager cannot read the audit trail for a site she does not manage'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select is(
  (select quantity from public.inventory_transactions where id = (select id from inv_row)),
  4::numeric,
  'Area Manager''s update at an unmanaged site had no effect (verified as Director)'
);
select is(
  (select count(*) from public.inventory_transactions where id = (select id from inv_row)),
  1::bigint,
  'Area Manager''s delete at an unmanaged site had no effect (verified as Director)'
);

-- Site Supervisor: no finance access at all, unaffected by this change.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*) from public.inventory_transactions where id = (select id from inv_row)),
  0::bigint,
  'Site Supervisor still cannot read the inventory ledger'
);
select is(
  (select count(*) from public.finance_ledger_audit_events),
  0::bigint,
  'Site Supervisor cannot read the finance audit trail'
);

-- Cross-tenant Director (org 2): denied on both counts.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
select is(
  (select count(*) from public.inventory_transactions where id = (select id from inv_row)),
  0::bigint,
  'Cross-tenant Director cannot read another organization''s inventory ledger'
);
select is(
  (select count(*) from public.finance_ledger_audit_events),
  0::bigint,
  'Cross-tenant Director cannot read another organization''s finance audit trail'
);

select * from finish();
rollback;
