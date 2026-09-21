begin;

-- A worker-created normalized message gets deterministic account-site context
-- and one safe media metadata record before a supervisor opens it.
set local role service_role;

insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, dedupe_key, payload, payload_sha256
) values (
  'd1000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'clean-027-normalized-finance-test',
  '{}'::jsonb,
  repeat('a', 64)
);

insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at, received_at,
  text_content, media_refs
) values (
  'e1000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'wamid.clean-027-test', 'thread-clean-027', '15551234567', now(), now(),
  'Supervisor reports a stock delivery.',
  '[{"externalId":"media-clean-027","contentType":"image/jpeg"}]'::jsonb
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

do $$
declare
  v_count integer;
  v_context uuid;
  v_vendor uuid;
  v_item uuid;
begin
  select count(*) into v_count
    from public.external_message_contexts
   where external_message_id = 'e1000000-0000-4000-8000-000000000001';
  if v_count <> 1 then
    raise exception 'site supervisor did not see one generated message context, saw %', v_count;
  end if;

  select count(*) into v_count
    from public.list_site_external_messages('40000000-0000-4000-8000-000000000001', 25)
   where message_id = 'e1000000-0000-4000-8000-000000000001'
     and text_content = 'Supervisor reports a stock delivery.';
  if v_count <> 1 then
    raise exception 'site supervisor did not see the normalized message text';
  end if;

  select count(*) into v_count
    from public.external_message_media
   where external_message_id = 'e1000000-0000-4000-8000-000000000001'
     and media_kind = 'image'
     and ingestion_status = 'pending';
  if v_count <> 1 then
    raise exception 'generated media metadata was unavailable to site supervisor';
  end if;

  select id into v_context from public.external_message_contexts
   where external_message_id = 'e1000000-0000-4000-8000-000000000001';
  update public.external_message_contexts
     set sender_role = 'supervisor', resolution_status = 'confirmed',
         resolution_source = 'manual', confidence = 1, resolved_at = now(), updated_at = now()
   where id = v_context;
  if not found then raise exception 'site supervisor could not confirm own-site context'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_count integer;
  v_vendor uuid;
  v_item uuid;
begin
  select id into v_vendor from public.vendors where organization_id = '10000000-0000-4000-8000-000000000001' order by name limit 1;
  select id into v_item from public.inventory_items where organization_id = '10000000-0000-4000-8000-000000000001' order by name limit 1;
  insert into public.inventory_transactions (
    organization_id, site_id, vendor_id, inventory_item_id, transaction_type, quantity, unit_cost, occurred_at
  ) values (
    '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
    v_vendor, v_item, 'receipt', 2, 7.50, now()
  );
  select count(*) into v_count from public.inventory_transactions
   where site_id = '40000000-0000-4000-8000-000000000001' and total_cost = 15.00;
  if v_count < 1 then raise exception 'inventory total cost was not database-generated'; end if;

  insert into public.labor_cost_entries (
    organization_id, site_id, work_date, hours, hourly_cost, cost_type
  ) values (
    '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
    current_date, 2, 24.50, 'regular'
  );
  select count(*) into v_count from public.labor_cost_entries
   where site_id = '40000000-0000-4000-8000-000000000001' and total_cost = 49.00;
  if v_count < 1 then raise exception 'labour total cost was not database-generated'; end if;

end;
$$;

rollback;
