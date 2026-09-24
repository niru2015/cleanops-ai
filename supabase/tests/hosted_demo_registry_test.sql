begin;
set local search_path=public,extensions;
select no_plan();

select ok((select relrowsecurity from pg_class where oid='public.demo_scenario_runs'::regclass),
  'hosted run registry has RLS');
select ok(not has_table_privilege('anon','public.demo_scenario_runs','select'),
  'anonymous browser cannot read hosted run registry');
select ok(not has_table_privilege('authenticated','public.demo_scenario_runs','select'),
  'authenticated browser cannot read hosted run registry');
select ok(not has_table_privilege('authenticated','public.demo_scenario_runs','insert'),
  'authenticated browser cannot forge hosted run registry');
select ok(has_table_privilege('service_role','public.demo_scenario_runs','insert'),
  'protected service tooling can create a hosted run');

select * from finish();
rollback;
