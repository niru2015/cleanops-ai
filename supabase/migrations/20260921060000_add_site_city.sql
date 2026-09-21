alter table public.sites
  add column if not exists city text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sites_city_length') then
    alter table public.sites add constraint sites_city_length
      check (city is null or length(trim(city)) between 2 and 120);
  end if;
end $$;
