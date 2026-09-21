-- CLEAN-027: make normalized message records and finance capture available to
-- authenticated supervisors, while retaining worker-only ingestion.

create function private.sync_external_message_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site_id uuid;
  v_media jsonb;
  v_content_type text;
begin
  select account.site_id
    into v_site_id
    from public.integration_accounts as account
   where account.organization_id = new.organization_id
     and account.id = new.integration_account_id;

  insert into public.external_message_contexts (
    organization_id, external_message_id, site_id, resolution_status, resolution_source
  ) values (
    new.organization_id, new.id, v_site_id,
    case when v_site_id is null then 'unresolved' else 'suggested' end,
    case when v_site_id is null then null else 'deterministic' end
  )
  on conflict (organization_id, external_message_id) do nothing;

  for v_media in select value from jsonb_array_elements(new.media_refs)
  loop
    v_content_type := nullif(v_media ->> 'contentType', '');
    if nullif(v_media ->> 'externalId', '') is null then
      continue;
    end if;

    insert into public.external_message_media (
      organization_id, external_message_id, media_kind, external_media_id, mime_type, ingestion_status
    ) values (
      new.organization_id,
      new.id,
      case
        when v_content_type like 'image/%' then 'image'
        when v_content_type like 'video/%' then 'video'
        when v_content_type like 'audio/%' then 'audio'
        else 'document'
      end,
      v_media ->> 'externalId',
      v_content_type,
      'pending'
    )
    on conflict (organization_id, external_message_id, external_media_id) do nothing;
  end loop;

  return new;
end;
$$;

revoke execute on function private.sync_external_message_records() from public, anon, authenticated;

create trigger external_messages_sync_normalized_records
after insert on public.external_messages
for each row execute function private.sync_external_message_records();

create function private.sync_external_message_media_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.external_message_media as media
     set storage_path = new.storage_path,
         mime_type = coalesce(new.content_type, media.mime_type),
         ingestion_status = case new.processing_status::text
           when 'ready' then 'downloaded'
           when 'quarantined' then 'quarantined'
           when 'missing' then 'failed'
           else 'pending'
         end
   where media.organization_id = new.organization_id
     and media.external_message_id = new.external_message_id
     and media.external_media_id = new.media_external_id;
  return new;
end;
$$;

revoke execute on function private.sync_external_message_media_evidence() from public, anon, authenticated;

create trigger task_evidence_sync_normalized_media
after insert or update of processing_status, storage_path, content_type on public.task_evidence
for each row execute function private.sync_external_message_media_evidence();

-- Backfill only rows that pre-date the triggers.  Account site is a deterministic
-- suggestion; a supervisor still confirms area, task and sender identity.
insert into public.external_message_contexts (
  organization_id, external_message_id, site_id, resolution_status, resolution_source
)
select
  message.organization_id,
  message.id,
  account.site_id,
  case when account.site_id is null then 'unresolved' else 'suggested' end,
  case when account.site_id is null then null else 'deterministic' end
from public.external_messages as message
join public.integration_accounts as account
  on account.organization_id = message.organization_id
 and account.id = message.integration_account_id
on conflict (organization_id, external_message_id) do nothing;

insert into public.external_message_media (
  organization_id, external_message_id, media_kind, external_media_id, mime_type, ingestion_status
)
select
  message.organization_id,
  message.id,
  case
    when nullif(reference.value ->> 'contentType', '') like 'image/%' then 'image'
    when nullif(reference.value ->> 'contentType', '') like 'video/%' then 'video'
    when nullif(reference.value ->> 'contentType', '') like 'audio/%' then 'audio'
    else 'document'
  end,
  reference.value ->> 'externalId',
  nullif(reference.value ->> 'contentType', ''),
  'pending'
from public.external_messages as message
cross join lateral jsonb_array_elements(message.media_refs) as reference(value)
where nullif(reference.value ->> 'externalId', '') is not null
on conflict (organization_id, external_message_id, external_media_id) do nothing;

update public.external_message_media as media
   set storage_path = evidence.storage_path,
       mime_type = coalesce(evidence.content_type, media.mime_type),
       ingestion_status = case evidence.processing_status::text
         when 'ready' then 'downloaded'
         when 'quarantined' then 'quarantined'
         when 'missing' then 'failed'
         else 'pending'
       end
  from public.task_evidence as evidence
 where evidence.organization_id = media.organization_id
   and evidence.external_message_id = media.external_message_id
   and evidence.media_external_id = media.external_media_id;

-- Only a supervisor or manager of the context site can read or resolve a message.
grant select on table public.external_message_media to authenticated;
grant select, update on table public.external_message_contexts to authenticated;

create policy external_message_contexts_select on public.external_message_contexts for select to authenticated
  using (site_id is not null and private.has_operational_site_access(organization_id, site_id));
create policy external_message_contexts_update on public.external_message_contexts for update to authenticated
  using (site_id is not null and private.can_manage_site(organization_id, site_id))
  with check (site_id is not null and private.can_manage_site(organization_id, site_id));

create policy external_message_media_select on public.external_message_media for select to authenticated
  using (exists (
    select 1
      from public.external_message_contexts as context
     where context.organization_id = external_message_media.organization_id
       and context.external_message_id = external_message_media.external_message_id
       and context.site_id is not null
       and private.has_operational_site_access(context.organization_id, context.site_id)
  ));

-- Financial records remain immutable in this slice: corrections are new adjustment
-- or labour records, preserving the original operational source.
grant select, insert, update on table public.vendors, public.inventory_items to authenticated;
grant select, insert on table public.inventory_transactions, public.labor_cost_entries to authenticated;

create policy vendors_select on public.vendors for select to authenticated
  using (private.is_active_member(organization_id));
create policy vendors_insert on public.vendors for insert to authenticated
  with check (private.can_operate_org(organization_id));
create policy vendors_update on public.vendors for update to authenticated
  using (private.can_operate_org(organization_id))
  with check (private.can_operate_org(organization_id));

create policy inventory_items_select on public.inventory_items for select to authenticated
  using (private.is_active_member(organization_id));
create policy inventory_items_insert on public.inventory_items for insert to authenticated
  with check (private.can_operate_org(organization_id));
create policy inventory_items_update on public.inventory_items for update to authenticated
  using (private.can_operate_org(organization_id))
  with check (private.can_operate_org(organization_id));

create policy inventory_transactions_select on public.inventory_transactions for select to authenticated
  using (private.has_operational_site_access(organization_id, site_id));
create policy inventory_transactions_insert on public.inventory_transactions for insert to authenticated
  with check (private.can_manage_site(organization_id, site_id));

create policy labor_cost_entries_select on public.labor_cost_entries for select to authenticated
  using (private.has_operational_site_access(organization_id, site_id));
create policy labor_cost_entries_insert on public.labor_cost_entries for insert to authenticated
  with check (private.can_manage_site(organization_id, site_id));
