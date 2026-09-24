-- CLEAN-022: resolve the site zone on an extracted draft obligation without
-- deleting its source-linked row or losing the human extraction decision.
alter table public.contract_events
  drop constraint contract_events_event_type_check;
alter table public.contract_events
  add constraint contract_events_event_type_check
  check (event_type in ('submitted','approved','activated','superseded','obligation_zone_assigned'));

create function public.assign_contract_obligation_zone(p_obligation_id uuid, p_zone_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare obligation public.contract_obligations%rowtype;
declare version_state text;
declare event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Contract draft access denied' using errcode = '42501';
  end if;
  select * into obligation from public.contract_obligations
    where id = p_obligation_id for update;
  if not found then
    raise exception 'Contract obligation unavailable' using errcode = '42501';
  end if;
  select state into version_state from public.contract_versions
    where id = obligation.contract_version_id
      and organization_id = obligation.organization_id
      and site_id = obligation.site_id for update;
  if version_state is distinct from 'draft' or
    not private.can_edit_contract(obligation.organization_id, obligation.site_id) then
    raise exception 'Contract draft access denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.site_zones
      where id = p_zone_id and organization_id = obligation.organization_id
        and site_id = obligation.site_id) then
    raise exception 'Zone is unavailable for this contract site' using errcode = '42501';
  end if;
  if obligation.zone_id is not distinct from p_zone_id then return null; end if;

  update public.contract_obligations set zone_id = p_zone_id where id = obligation.id;
  insert into public.contract_events
    (organization_id, site_id, contract_version_id, actor_id, event_type, details)
  values (obligation.organization_id, obligation.site_id, obligation.contract_version_id,
    auth.uid(), 'obligation_zone_assigned', jsonb_build_object(
      'obligation_id', obligation.id,
      'previous_zone_id', obligation.zone_id,
      'zone_id', p_zone_id))
  returning id into event_id;
  return event_id;
end;
$$;
revoke all on function public.assign_contract_obligation_zone(uuid,uuid) from public,anon;
grant execute on function public.assign_contract_obligation_zone(uuid,uuid) to authenticated,service_role;
