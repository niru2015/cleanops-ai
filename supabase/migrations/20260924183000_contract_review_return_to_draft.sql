-- CLEAN-022: a submitted version can be returned for source review without
-- replacing its documents, extraction decisions, or canonical contract rows.
alter table public.contract_events drop constraint contract_events_event_type_check;
alter table public.contract_events add constraint contract_events_event_type_check
  check (event_type in ('submitted','approved','activated','superseded',
    'obligation_zone_assigned','returned_to_draft'));

create function public.return_contract_version_to_draft(p_contract_version_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.contract_versions%rowtype;
declare event_id uuid;
begin
  select * into v from public.contract_versions where id = p_contract_version_id for update;
  if not found or auth.uid() is null or v.state <> 'in_review'
    or not private.can_edit_contract(v.organization_id, v.site_id) then
    raise exception 'Submitted contract is unavailable for revision' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason,''))) < 5 or length(p_reason) > 500 then
    raise exception 'A revision reason of 5 to 500 characters is required';
  end if;
  update public.contract_versions set state = 'draft', updated_at = now() where id = v.id;
  insert into public.contract_events
    (organization_id, site_id, contract_version_id, actor_id, event_type, details)
  values (v.organization_id, v.site_id, v.id, auth.uid(), 'returned_to_draft',
    jsonb_build_object('previous_state','in_review','state','draft','reason',trim(p_reason)))
  returning id into event_id;
  return event_id;
end;
$$;
revoke all on function public.return_contract_version_to_draft(uuid,text) from public,anon;
grant execute on function public.return_contract_version_to_draft(uuid,text) to authenticated,service_role;

-- A version may have more than one review cycle. The state guard keeps each
-- submission singular; the event ID must be unique across cycles.
create or replace function public.submit_contract_version(p_contract_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.contract_versions%rowtype;
begin
  select * into v from public.contract_versions where id = p_contract_version_id for update;
  if not found or auth.uid() is null or not private.can_edit_contract(v.organization_id, v.site_id)
    or v.state <> 'draft' then
    raise exception 'Contract draft is unavailable for submission' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.contract_extraction_proposals p
    join public.contract_extraction_runs r on r.id = p.run_id
    where p.contract_version_id = v.id and r.status = 'succeeded'
      and p.business_state <> 'not_found'
      and not exists (select 1 from public.contract_extraction_decisions d where d.proposal_id = p.id)
  ) then
    raise exception 'Resolve material document proposals before submission';
  end if;
  update public.contract_versions set state = 'in_review', updated_at = now() where id = v.id;
  insert into public.contract_events
    (organization_id, site_id, contract_version_id, actor_id, event_type)
  values (v.organization_id, v.site_id, v.id, auth.uid(), 'submitted');
end;
$$;
