-- CLEAN-012: one audited, site-bound fixture operation at a time. Browser roles
-- cannot call these functions; the server also checks the signed-in actor.
create table public.hosted_demo_fixture_operations (
  operation_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null unique,
  actor_user_id uuid not null,
  action text not null check (action in ('prepare_initial', 'submit_correction', 'reset')),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz
);

create table public.hosted_demo_fixture_audit (
  operation_id uuid not null,
  organization_id uuid not null,
  site_id uuid not null,
  actor_user_id uuid not null,
  action text not null,
  status text not null check (status in ('started', 'succeeded', 'failed')),
  recorded_at timestamptz not null default now()
);

alter table public.hosted_demo_fixture_operations enable row level security;
alter table public.hosted_demo_fixture_audit enable row level security;
revoke all on public.hosted_demo_fixture_operations, public.hosted_demo_fixture_audit from public, anon, authenticated;
grant select, insert, update on public.hosted_demo_fixture_operations to service_role;
grant insert, select on public.hosted_demo_fixture_audit to service_role;

create function public.begin_hosted_demo_fixture_operation(
  p_actor_user_id uuid, p_site_id uuid, p_action text
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_membership public.memberships%rowtype;
  v_operation uuid;
begin
  if p_actor_user_id is null
    or p_site_id is distinct from '40000000-0000-4000-8000-000000000001'::uuid
    or p_action not in ('prepare_initial', 'submit_correction', 'reset') then
    raise exception 'demo_fixture_denied' using errcode = '42501';
  end if;
  select * into v_membership from public.memberships
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and user_id = p_actor_user_id and state = 'active';
  if not found or v_membership.role not in ('site_supervisor','area_manager','operations_manager','organization_administrator') then
    raise exception 'demo_fixture_denied' using errcode = '42501';
  end if;
  if v_membership.role not in ('operations_manager','organization_administrator')
    and not exists (
      select 1 from public.member_site_access
       where membership_id = v_membership.id and site_id = p_site_id
         and starts_at <= now() and (ends_at is null or ends_at > now())
    ) then
    raise exception 'demo_fixture_denied' using errcode = '42501';
  end if;
  insert into public.hosted_demo_fixture_operations
    (organization_id, site_id, actor_user_id, action, status, expires_at)
  values ('10000000-0000-4000-8000-000000000001', p_site_id,
    p_actor_user_id, p_action, 'running', now() + interval '5 minutes')
  on conflict (site_id) do update set
    operation_id = excluded.operation_id,
    actor_user_id = excluded.actor_user_id,
    action = excluded.action,
    status = 'running',
    started_at = now(),
    expires_at = excluded.expires_at,
    finished_at = null
  where public.hosted_demo_fixture_operations.status <> 'running'
     or public.hosted_demo_fixture_operations.expires_at <= now()
  returning operation_id into v_operation;
  if v_operation is null then
    raise exception 'demo_fixture_busy' using errcode = '40001';
  end if;
  insert into public.hosted_demo_fixture_audit
    (operation_id, organization_id, site_id, actor_user_id, action, status)
  values (v_operation, '10000000-0000-4000-8000-000000000001',
    p_site_id, p_actor_user_id, p_action, 'started');
  return jsonb_build_object('operation_id', v_operation);
end;
$$;

create function public.finish_hosted_demo_fixture_operation(
  p_operation_id uuid, p_succeeded boolean
)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  v_operation public.hosted_demo_fixture_operations%rowtype;
begin
  update public.hosted_demo_fixture_operations
     set status = case when p_succeeded then 'succeeded' else 'failed' end,
         finished_at = now()
   where operation_id = p_operation_id and status = 'running'
   returning * into v_operation;
  if not found then return false; end if;
  insert into public.hosted_demo_fixture_audit
    (operation_id, organization_id, site_id, actor_user_id, action, status)
  values (v_operation.operation_id, v_operation.organization_id,
    v_operation.site_id, v_operation.actor_user_id, v_operation.action,
    case when p_succeeded then 'succeeded' else 'failed' end);
  return true;
end;
$$;

-- Claim only the accepted fixture event, never an unrelated ingress job.
create function public.claim_hosted_demo_fixture_job(
  p_job_id uuid, p_worker_id text
)
returns table (job_id uuid, payload jsonb)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
  v_event public.integration_webhook_events%rowtype;
begin
  if p_worker_id is null or char_length(p_worker_id) not between 1 and 120 then
    raise exception 'invalid_worker_id' using errcode = '22023';
  end if;
  select * into v_job from public.processing_jobs
   where id = p_job_id
     and organization_id = '10000000-0000-4000-8000-000000000001'
     and ((status = 'pending' and next_attempt_at <= now())
       or (status = 'processing' and lease_expires_at <= now()))
     and attempt_count < max_attempts
   for update skip locked;
  if not found then return; end if;
  select * into v_event from public.integration_webhook_events
   where id = v_job.integration_event_id
     and integration_account_id = 'c0000000-0000-4000-8000-000000000001'
     and provider_event_id in ('clean-004-golden-replay','clean-005-correction-replay');
  if not found then raise exception 'demo_fixture_denied' using errcode = '42501'; end if;
  update public.processing_jobs set status = 'processing',
      attempt_count = attempt_count + 1, lease_owner = p_worker_id,
      lease_expires_at = now() + interval '60 seconds', updated_at = now()
    where id = p_job_id;
  return query select p_job_id, v_event.payload;
end;
$$;

revoke execute on function public.begin_hosted_demo_fixture_operation(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.finish_hosted_demo_fixture_operation(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.claim_hosted_demo_fixture_job(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_hosted_demo_fixture_operation(uuid, uuid, text) to service_role;
grant execute on function public.finish_hosted_demo_fixture_operation(uuid, boolean) to service_role;
grant execute on function public.claim_hosted_demo_fixture_job(uuid, text) to service_role;
