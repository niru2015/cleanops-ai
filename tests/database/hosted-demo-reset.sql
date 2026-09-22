begin;

set local role authenticated;
do $$
begin
  perform * from public.reset_hosted_demo();
  raise exception 'authenticated users could execute the hosted demo reset directly';
exception
  when insufficient_privilege then null;
end;
$$;

set local role service_role;

insert into public.shift_assignments (
  id, organization_id, site_id, shift_id, worker_id
) values (
  'e9000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000041'
);

insert into public.replacement_selections (
  organization_id, site_id, shift_id, worker_id, assignment_id, selected_by, selected_at
) values (
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000041',
  'e9000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '2026-09-14T06:10:00Z'
);

insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, dedupe_key, payload, payload_sha256
) values (
  'ea000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'hosted-reset-test', '{}', repeat('a', 64)
);

insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at, received_at
) values (
  'eb000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000001',
  'hosted-reset-message', 'cleanops-mobile-demo', 'worker-182',
  '2026-09-14T06:15:00Z', '2026-09-14T06:15:01Z'
);

insert into public.task_evidence (
  id, organization_id, integration_account_id, external_message_id,
  media_external_id, site_id, processing_status, linkage_status,
  storage_path, received_at
) values (
  'ec000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'eb000000-0000-4000-8000-000000000001',
  'hosted-reset-media', '40000000-0000-4000-8000-000000000001',
  'staged', 'unresolved', 'hosted-reset/test.png', '2026-09-14T06:15:01Z'
);

update public.task_runs
   set state = 'submitted', submission_revision = 2
 where id = '81000000-0000-4000-8000-000000000001';

-- CLEAN-012 follow-up: a Director's finance entries against the walkthrough site
-- must not survive a reset (previously they did, since the function predated
-- these tables).
do $$
declare
  v_vendor uuid;
  v_item uuid;
begin
  select id into v_vendor from public.vendors where organization_id = '10000000-0000-4000-8000-000000000001' order by name limit 1;
  select id into v_item from public.inventory_items where organization_id = '10000000-0000-4000-8000-000000000001' order by name limit 1;
  insert into public.inventory_transactions (
    id, organization_id, site_id, vendor_id, inventory_item_id, transaction_type, quantity, unit_cost, occurred_at
  ) values (
    'ed000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
    v_vendor, v_item, 'receipt', 2, 7.50, now()
  );
  insert into public.labor_cost_entries (
    id, organization_id, site_id, work_date, hours, hourly_cost, cost_type
  ) values (
    'ee000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
    current_date, 2, 24.50, 'regular'
  );
end;
$$;

create temporary table reset_paths (storage_path text);
insert into reset_paths select * from public.reset_hosted_demo();

do $$
begin
  if not exists (select 1 from reset_paths where storage_path = 'hosted-reset/test.png') then
    raise exception 'reset did not return the storage path';
  end if;
  if exists (select 1 from public.task_evidence where id = 'ec000000-0000-4000-8000-000000000001') then
    raise exception 'reset retained demo evidence';
  end if;
  if exists (select 1 from public.integration_webhook_events where id = 'ea000000-0000-4000-8000-000000000001') then
    raise exception 'reset retained demo ingress';
  end if;
  if exists (select 1 from public.replacement_selections where shift_id = '90000000-0000-4000-8000-000000000001') then
    raise exception 'reset retained replacement selections';
  end if;
  if exists (select 1 from public.shift_assignments where id = 'e9000000-0000-4000-8000-000000000001') then
    raise exception 'reset retained the candidate assignment';
  end if;
  if exists (select 1 from public.inventory_transactions where id = 'ed000000-0000-4000-8000-000000000001') then
    raise exception 'reset retained a demo inventory transaction';
  end if;
  if exists (select 1 from public.labor_cost_entries where id = 'ee000000-0000-4000-8000-000000000001') then
    raise exception 'reset retained a demo labour cost entry';
  end if;
  if (select state from public.task_runs where id = '81000000-0000-4000-8000-000000000001') <> 'ready'
     or (select submission_revision from public.task_runs where id = '81000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'reset did not restore the task state';
  end if;
end;
$$;

rollback;
