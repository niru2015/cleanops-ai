begin;
set local search_path = public, extensions;
select plan(18);

select results_eq($$select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('finance_import_batches','finance_source_rows','finance_source_allocations','finance_reconciliations') and c.relrowsecurity$$, array[4::bigint], 'RLS enabled on finance import tables');
select ok(not has_function_privilege('anon','public.stage_finance_csv_import(uuid,text,text,text,text,date,date,jsonb,uuid)','execute'), 'anonymous cannot stage imports');
select ok(not has_function_privilege('anon','public.accept_finance_import(uuid,text)','execute'), 'anonymous cannot accept imports');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);

create temporary table first_batch as select public.stage_finance_csv_import(
  '10000000-0000-4000-8000-000000000001','august.csv',repeat('a',64),'cleanops-neutral-v1','CAD','2026-08-01','2026-08-31',
  '[
    {"source_row_number":2,"source_document_id":"REV-AUG","source_line_id":"1","site_id":"40000000-0000-4000-8000-000000000002","service_period":"2026-08-01","accounting_period":"2026-08-01","currency":"CAD","category":"revenue","amount":"350000.00","approval_state":"approved","recognition_state":"actual"},
    {"source_row_number":3,"source_document_id":"LAB-AUG","source_line_id":"1","site_id":"40000000-0000-4000-8000-000000000002","service_period":"2026-08-01","accounting_period":"2026-08-01","currency":"CAD","category":"direct_labour","amount":"230000.00","approval_state":"approved","recognition_state":"actual"},
    {"source_row_number":4,"source_document_id":"SUP-AUG","source_line_id":"1","site_id":"40000000-0000-4000-8000-000000000002","service_period":"2026-08-01","accounting_period":"2026-08-01","currency":"CAD","category":"supplies","amount":"35000.00","approval_state":"approved","recognition_state":"actual"},
    {"source_row_number":5,"source_document_id":"REP-AUG","source_line_id":"1","site_id":"40000000-0000-4000-8000-000000000002","service_period":"2026-08-01","accounting_period":"2026-08-01","currency":"CAD","category":"repairs","amount":"15000.00","approval_state":"approved","recognition_state":"actual"},
    {"source_row_number":6,"source_document_id":"OTH-AUG","source_line_id":"1","site_id":"40000000-0000-4000-8000-000000000002","service_period":"2026-08-01","accounting_period":"2026-08-01","currency":"CAD","category":"other_direct_cost","amount":"10000.00","approval_state":"approved","recognition_state":"actual"}
  ]'::jsonb,null
) id;

select is(public.stage_finance_csv_import('10000000-0000-4000-8000-000000000001','august-again.csv',repeat('a',64),'cleanops-neutral-v1','CAD','2026-08-01','2026-08-31','[{"ignored":true}]'::jsonb,null),(select id from first_batch),'same file and mapping resolve to one batch');
select is((select count(*) from public.finance_source_rows where import_batch_id=(select id from first_batch)),5::bigint,'duplicate import creates no source rows');
select public.accept_finance_import((select id from first_batch),'complete');
select is((select recognized_revenue from public.finance_reconciliations where import_batch_id=(select id from first_batch)),350000.00::numeric,'August revenue reconciles');
select is((select direct_labour+supplies+repairs+other_direct_cost from public.finance_reconciliations where import_batch_id=(select id from first_batch)),290000.00::numeric,'August direct cost reconciles');
select is((select direct_contribution from public.finance_reconciliations where import_batch_id=(select id from first_batch)),60000.00::numeric,'August direct contribution reconciles');

create temporary table correction_batch as select public.stage_finance_csv_import(
  '10000000-0000-4000-8000-000000000001','august-correction.csv',repeat('b',64),'cleanops-neutral-v1','CAD','2026-08-01','2026-08-31',
  '[{"source_row_number":2,"source_document_id":"REV-AUG-CORRECTED","source_line_id":"1","site_id":"40000000-0000-4000-8000-000000000002","service_period":"2026-08-01","accounting_period":"2026-08-01","currency":"CAD","category":"revenue","amount":"351000.00","approval_state":"approved","recognition_state":"actual"}]'::jsonb,(select id from first_batch)
) id;
select public.accept_finance_import((select id from correction_batch),'complete');
select is((select state from public.finance_import_batches where id=(select id from first_batch)),'superseded','correction preserves and supersedes original batch');
select is((select count(*) from public.finance_reconciliations where import_batch_id=(select id from first_batch) and not is_current),1::bigint,'superseded reconciliation remains auditable');
select is((select direct_contribution from public.finance_reconciliations where import_batch_id=(select id from correction_batch) and is_current),351000.00::numeric,'corrected batch becomes current');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.finance_source_rows),0::bigint,'Area Manager cannot read payroll-level source rows');
select is((select count(*) from public.labor_cost_entries),0::bigint,'Area Manager cannot read worker-level labour ledger rows');
select is((select count(*) from public.finance_reconciliations where is_current),1::bigint,'Area Manager reads assigned-site approved totals');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.finance_reconciliations),0::bigint,'Supervisor cannot read reconciled finance');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select is((select count(*) from public.finance_reconciliations),0::bigint,'Cleaner cannot read reconciled finance');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
select is((select count(*) from public.finance_reconciliations),0::bigint,'Client cannot read margins');
select throws_ok($$select public.stage_finance_csv_import('10000000-0000-4000-8000-000000000001','forbidden.csv',repeat('c',64),'v1','CAD','2026-08-01','2026-08-31','[{"x":1}]',null)$$,'42501','director access is required','non-Director cannot stage an import');

select * from finish();
rollback;
