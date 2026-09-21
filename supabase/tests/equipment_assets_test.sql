begin;
set local search_path = public, extensions;

select plan(4);

select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'public.equipment_assets'::regclass $$,
  array[true],
  'equipment assets enforce RLS'
);

set local role anon;
select throws_ok(
  $$ select id from public.equipment_assets $$,
  '42501',
  'permission denied for table equipment_assets',
  'anonymous users cannot read equipment assets'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select count(*) from public.equipment_assets $$,
  array[3::bigint],
  'site supervisor sees equipment only at the granted site'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*) from public.equipment_assets $$,
  array[6::bigint],
  'organization administrator sees equipment across tenant sites'
);

select * from finish();
rollback;
