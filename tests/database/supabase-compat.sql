-- Minimal Supabase role/auth surface for executing migrations in a temporary stock Postgres.
-- The canonical runtime remains the Supabase local stack configured under supabase/.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth authorization postgres;
create schema storage authorization postgres;

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

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id) on delete cascade,
  name text not null,
  owner_id text,
  metadata jsonb,
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select on table storage.objects to authenticated;
grant all on table storage.buckets, storage.objects to service_role;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'operational-evidence',
  'operational-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
);
