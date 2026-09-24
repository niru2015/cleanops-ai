-- CLEAN-012: approved submissions remain final except for the two enumerated
-- synthetic task runs restored by the service-only hosted reset.
create or replace function private.protect_approved_submission()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.state = 'approved'
    and (new.state <> 'approved' or new.submission_revision <> old.submission_revision)
    and not (
      current_user = 'service_role'
      and old.organization_id = '10000000-0000-4000-8000-000000000001'::uuid
      and old.site_id = '40000000-0000-4000-8000-000000000001'::uuid
      and old.id in (
        '81000000-0000-4000-8000-000000000001'::uuid,
        '81000000-0000-4000-8000-000000000004'::uuid)
      and new.state = 'ready' and new.submission_revision = 0
    ) then
    raise exception using errcode = '40001', message = 'approved_submission_is_final';
  end if;
  return new;
end;
$$;
