-- Minimal Supabase role/auth surface for executing migrations in a temporary stock Postgres.
-- The canonical runtime remains the Supabase local stack configured under supabase/.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth authorization postgres;

create table auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
