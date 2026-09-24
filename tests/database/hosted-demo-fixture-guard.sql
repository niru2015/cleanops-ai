begin;

set local role authenticated;
do $$
begin
  perform public.begin_hosted_demo_fixture_operation(
    '00000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001', 'prepare_initial');
  raise exception 'browser role executed the fixture command';
exception when insufficient_privilege then null;
end;
$$;

set local role service_role;
do $$
declare
  v_id uuid;
begin
  begin
    perform public.begin_hosted_demo_fixture_operation(
      '00000000-0000-4000-8000-000000000004',
      '40000000-0000-4000-8000-000000000001', 'prepare_initial');
    raise exception 'cleaner executed the fixture command';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.begin_hosted_demo_fixture_operation(
      '00000000-0000-4000-8000-000000000005',
      '40000000-0000-4000-8000-000000000001', 'prepare_initial');
    raise exception 'client executed the fixture command';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.begin_hosted_demo_fixture_operation(
      null, '40000000-0000-4000-8000-000000000001', 'prepare_initial');
    raise exception 'anonymous actor executed the fixture command';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.begin_hosted_demo_fixture_operation(
      '00000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000001', 'prepare_initial');
    raise exception 'manager with another site executed the fixture command';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.begin_hosted_demo_fixture_operation(
      '00000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000002', 'prepare_initial');
    raise exception 'unrelated site accepted';
  exception when insufficient_privilege then null;
  end;

  v_id := (public.begin_hosted_demo_fixture_operation(
    '00000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001', 'prepare_initial')->>'operation_id')::uuid;
  if v_id is null then raise exception 'supervisor fixture command failed'; end if;
  begin
    perform public.begin_hosted_demo_fixture_operation(
      '00000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001', 'reset');
    raise exception 'concurrent reset was accepted';
  exception when serialization_failure then null;
  end;
  if not public.finish_hosted_demo_fixture_operation(v_id, true) then
    raise exception 'fixture operation was not released';
  end if;
  if (select count(*) from public.hosted_demo_fixture_audit where operation_id = v_id) <> 2 then
    raise exception 'fixture start/finish audit is incomplete';
  end if;
  v_id := (public.begin_hosted_demo_fixture_operation(
    '00000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001', 'reset')->>'operation_id')::uuid;
  if not public.finish_hosted_demo_fixture_operation(v_id, false) then
    raise exception 'reset operation was not released';
  end if;
  update public.memberships set state = 'revoked'
   where id = '20000000-0000-4000-8000-000000000002';
  begin
    perform public.begin_hosted_demo_fixture_operation(
      '00000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001', 'prepare_initial');
    raise exception 'revoked supervisor executed the fixture command';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
