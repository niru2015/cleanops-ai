alter table public.sites
  add column city text;

alter table public.sites
  add constraint sites_city_length
  check (city is null or length(trim(city)) between 2 and 120);
