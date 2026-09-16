begin;

set local role anon;
do $$
begin
  begin
    perform id from public.organizations;
    raise exception 'anonymous select unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

do $$
declare
  visible_count integer;
  changed_count integer;
begin
  select count(*) into visible_count from public.organizations;
  if visible_count <> 1 then
    raise exception 'site supervisor expected 1 organization, saw %', visible_count;
  end if;

  select count(*) into visible_count from public.sites;
  if visible_count <> 1 then
    raise exception 'site supervisor expected 1 granted site, saw %', visible_count;
  end if;

  update public.site_zones
     set name = 'Gaming Floor Verified Demo'
   where id = '50000000-0000-4000-8000-000000000001';
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'site supervisor allowed update matched % rows', changed_count;
  end if;

  update public.site_zones
     set name = 'Forbidden East Lobby Demo'
   where id = '50000000-0000-4000-8000-000000000002';
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then
    raise exception 'cross-site update matched % rows', changed_count;
  end if;

  begin
    insert into public.site_zones (organization_id, site_id, name)
    values (
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      'Forbidden Zone Demo'
    );
    raise exception 'cross-site insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  delete from public.service_tasks
   where id = '70000000-0000-4000-8000-000000000002';
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then
    raise exception 'cross-site delete matched % rows', changed_count;
  end if;

  select count(*) into visible_count
    from public.sites
   where organization_id = '10000000-0000-4000-8000-000000000002';
  if visible_count <> 0 then
    raise exception 'cross-tenant read exposed % rows', visible_count;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);

do $$
declare
  visible_count integer;
  changed_count integer;
begin
  select count(*) into visible_count from public.shift_assignments;
  if visible_count <> 1 then
    raise exception 'cleaner expected 1 own assignment, saw %', visible_count;
  end if;

  insert into public.attendance_events (
    id, organization_id, site_id, assignment_id, event_type, occurred_at, recorded_by
  ) values (
    'b0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'check_in',
    '2026-09-16T08:02:00Z',
    '00000000-0000-4000-8000-000000000004'
  );

  begin
    insert into public.attendance_events (
      id, organization_id, site_id, assignment_id, event_type, occurred_at, recorded_by
    ) values (
      'b0000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      'a0000000-0000-4000-8000-000000000002',
      'check_in',
      '2026-09-16T09:02:00Z',
      '00000000-0000-4000-8000-000000000004'
    );
    raise exception 'cross-site attendance insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  update public.service_tasks
     set name = 'Cleaner Forbidden Update'
   where id = '70000000-0000-4000-8000-000000000001';
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then
    raise exception 'cleaner task update matched % rows', changed_count;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

do $$
declare
  visible_count integer;
  changed_count integer;
begin
  select count(*) into visible_count from public.sites;
  if visible_count <> 2 then
    raise exception 'organization administrator expected 2 sites, saw %', visible_count;
  end if;

  insert into public.site_zones (id, organization_id, site_id, name)
  values (
    '50000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    'Temporary Admin Zone Demo'
  );

  delete from public.site_zones
   where id = '50000000-0000-4000-8000-000000000010';
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'administrator allowed delete matched % rows', changed_count;
  end if;

  begin
    insert into public.sites (organization_id, client_id, name, timezone)
    values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003',
      'Guessed Tenant Demo',
      'America/Vancouver'
    );
    raise exception 'guessed cross-tenant client id unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  begin
    insert into public.shift_assignments (
      organization_id, site_id, shift_id, worker_id
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '90000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002'
    );
    raise exception 'cross-site worker assignment unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  update public.memberships
     set state = 'revoked'
   where id = '20000000-0000-4000-8000-000000000002';
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'membership revocation matched % rows', changed_count;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

do $$
declare
  visible_count integer;
  changed_count integer;
begin
  select count(*) into visible_count from public.organizations;
  if visible_count <> 0 then
    raise exception 'revoked membership still exposed % organizations', visible_count;
  end if;

  update public.site_zones
     set name = 'Revoked User Update'
   where id = '50000000-0000-4000-8000-000000000001';
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then
    raise exception 'revoked member update matched % rows', changed_count;
  end if;
end;
$$;

rollback;
