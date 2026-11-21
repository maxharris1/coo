-- Stands in for the parts of Supabase the migration touches, so 0001_init.sql can be applied to a
-- plain Postgres (PGlite in tests). Never apply this to a Supabase project.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), phone text unique, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'coo_app') then create role coo_app nologin nobypassrls; end if;
  if not exists (select from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon, coo_app;
