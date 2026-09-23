begin;
set local search_path = public, extensions;
select plan(14);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);

create temporary table tenant_b_vendor as
  with created as (
    insert into public.vendors (organization_id, name)
    values ('10000000-0000-4000-8000-000000000002', 'Harbour Supplier Demo')
    returning id
  ) select id from created;
create temporary table tenant_b_item as
  with created as (
    insert into public.inventory_items (organization_id, name, unit_of_measure)
    values ('10000000-0000-4000-8000-000000000002', 'Harbour Cleaner Demo', 'unit')
    returning id
  ) select id from created;
create temporary table tenant_b_stock as
  with created as (
    insert into public.inventory_transactions
      (organization_id, site_id, vendor_id, inventory_item_id, transaction_type, quantity, unit_cost, occurred_at)
    values
      ('10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003',
       (select id from tenant_b_vendor), (select id from tenant_b_item), 'receipt', 2, 8, now())
    returning id
  ) select id from created;

select is((select count(*) from public.inventory_transactions where id = (select id from tenant_b_stock)), 1::bigint,
  'second organization Director can write and read own stock');
select is((select count(*) from public.inventory_transactions where organization_id = '10000000-0000-4000-8000-000000000001'), 0::bigint,
  'second organization Director cannot read first organization stock');
select throws_ok(
  $$ insert into public.inventory_transactions (organization_id, site_id, inventory_item_id, transaction_type, quantity, unit_cost, occurred_at)
     values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       (select id from tenant_b_item), 'receipt', 1, 1, now()) $$,
  '42501', null, 'second organization Director cannot write first organization ledger');

create temporary table tenant_b_batch as select public.stage_finance_csv_import(
  '10000000-0000-4000-8000-000000000002', 'tenant-b.csv', repeat('d',64), 'cleanops-neutral-v1', 'CAD',
  '2026-08-01', '2026-08-31',
  '[{"source_row_number":2,"source_document_id":"B-REV","source_line_id":"1","site_id":"40000000-0000-4000-8000-000000000003","service_period":"2026-08-01","accounting_period":"2026-08-01","currency":"CAD","category":"revenue","amount":"100.00","approval_state":"approved","recognition_state":"actual"}]'::jsonb,
  null) id;
select is((select count(*) from public.finance_import_batches where id = (select id from tenant_b_batch)), 1::bigint,
  'second organization Director can stage own import');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.inventory_transactions where id = (select id from tenant_b_stock)), 0::bigint,
  'first organization Director cannot read second organization stock');
select throws_ok(
  $$ insert into public.inventory_transactions (organization_id, site_id, inventory_item_id, transaction_type, quantity, unit_cost, occurred_at)
     values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003',
       (select id from tenant_b_item), 'receipt', 1, 1, now()) $$,
  '23503', null, 'cross-organization site ID fails composite foreign key');
select throws_ok(
  $$ insert into public.inventory_transactions (organization_id, site_id, vendor_id, inventory_item_id, transaction_type, quantity, unit_cost, occurred_at)
     values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       (select id from tenant_b_vendor), (select id from tenant_b_item), 'receipt', 1, 1, now()) $$,
  '23503', null, 'cross-organization vendor or item cannot attach to first organization ledger');
select throws_ok(
  $$ insert into public.labor_cost_entries (organization_id, site_id, worker_id, work_date, hours, hourly_cost, cost_type)
     values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       '60000000-0000-4000-8000-000000000003', current_date, 1, 20, 'regular') $$,
  '23503', null, 'cross-organization worker cannot attach to first organization labour');
select throws_ok(
  $$ insert into public.labor_cost_entries (organization_id, site_id, task_run_id, work_date, hours, hourly_cost, cost_type)
     values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       '81000000-0000-4000-8000-000000000003', current_date, 1, 20, 'regular') $$,
  '23503', null, 'cross-organization task cannot attach to first organization labour');
select throws_ok(
  $$ select public.stage_finance_csv_import('10000000-0000-4000-8000-000000000002', 'forged.csv', repeat('e',64), 'v1', 'CAD', '2026-08-01', '2026-08-31', '[{"x":1}]'::jsonb, null) $$,
  '42501', 'director access is required', 'Director cannot stage import for another organization');
select throws_ok(
  $$ select public.accept_finance_import((select id from tenant_b_batch), 'complete') $$,
  '42501', 'finance import not found or forbidden', 'Director cannot accept another organization import');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.inventory_transactions where id = (select id from tenant_b_stock)), 0::bigint,
  'Area Manager cannot read another organization site');
select throws_ok(
  $$ insert into public.inventory_transactions (organization_id, site_id, inventory_item_id, transaction_type, quantity, unit_cost, occurred_at)
     values ('10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003',
       (select id from tenant_b_item), 'receipt', 1, 1, now()) $$,
  '42501', null, 'Area Manager cannot write another organization site');

reset role;
update public.memberships set state = 'revoked' where id = '20000000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
select is((select count(*) from public.inventory_transactions where id = (select id from tenant_b_stock)), 0::bigint,
  'revoked membership immediately loses finance reads');

select * from finish();
rollback;
