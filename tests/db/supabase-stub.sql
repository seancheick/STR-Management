-- Minimal stand-in for the Supabase platform objects our migrations depend on,
-- so they can be applied to a plain local Postgres for security tests.
-- Mirrors Supabase defaults that matter for authorization:
--   * roles anon / authenticated / service_role (service_role bypasses RLS)
--   * default privileges: ALL on public tables/functions/sequences to all three
--   * auth.uid() / auth.role() read request.jwt.claims like Supabase does
-- Roles are cluster-wide, so tolerate leftovers from an earlier run.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Legacy helper exists in the hosted schema but predates recorded migrations.
-- Keep the disposable database faithful before the hardening migration alters it.
set check_function_bodies = off;
create function public.increment_inventory_quantity(p_item_id uuid, p_delta integer)
returns void language sql set search_path=public as $$
 update public.property_inventory_items set current_quantity=greatest(0,current_quantity+p_delta),updated_at=timezone('utc',now()) where id=p_item_id;
$$;
set check_function_bodies = on;
create publication supabase_realtime;
-- Supabase's platform event-trigger helper is not invoked by these fixtures.
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin end $$;
