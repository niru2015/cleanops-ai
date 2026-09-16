-- Event triggers invoke this helper as its owner. It should not be callable
-- directly by application or API roles.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
    grant execute on function public.rls_auto_enable() to postgres;
  end if;
end;
$$;
