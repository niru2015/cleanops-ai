-- Raw message storage remains worker-only. This narrowly scoped RPC exposes
-- just a supervisor's granted-site queue, including untrusted text for review.

revoke select on table public.external_messages from authenticated;
drop policy if exists external_messages_context_select on public.external_messages;

create function public.list_site_external_messages(
  p_site_id uuid,
  p_limit integer default 25,
  p_actor_user_id uuid default null
)
returns table (
  message_id uuid,
  sender_id text,
  text_content text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_message_limit';
  end if;

  select site.organization_id into v_organization_id
    from public.sites as site
   where site.id = p_site_id;
  if v_organization_id is null then
    raise exception using errcode = 'P0001', message = 'site_not_found';
  end if;

  perform private.resolve_review_actor(v_organization_id, p_site_id, p_actor_user_id);

  return query
  select message.id, message.sender_id, message.text_content, message.occurred_at
    from public.external_messages as message
    join public.external_message_contexts as context
      on context.organization_id = message.organization_id
     and context.external_message_id = message.id
   where message.organization_id = v_organization_id
     and context.site_id = p_site_id
   order by message.occurred_at desc, message.id desc
   limit p_limit;
end;
$$;

revoke execute on function public.list_site_external_messages(uuid, integer, uuid)
  from public, anon;
grant execute on function public.list_site_external_messages(uuid, integer, uuid)
  to authenticated, service_role;
