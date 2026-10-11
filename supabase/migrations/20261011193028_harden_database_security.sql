-- Preserve API/policy signatures while keeping privileged RLS lookups out of public.

begin;

-- Helper definitions reference each other; validate the complete graph in regression tests.
set local check_function_bodies = off;

create schema if not exists app_private;

revoke all on schema app_private from public, anon;

grant usage on schema app_private to authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.is_admin_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select coalesce(app_private.current_app_user_role() in ('owner', 'admin', 'supervisor'), false)
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$ select app_private.is_admin_role(); $function$;

revoke all on function app_private.is_admin_role() from public, anon;

grant execute on function app_private.is_admin_role() to authenticated, service_role;

revoke all on function public.is_admin_role() from public, anon;

grant execute on function public.is_admin_role() to authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.current_app_user_role()
 RETURNS public.user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select role from public.users where id = auth.uid() and active
$function$;

CREATE OR REPLACE FUNCTION public.current_app_user_role()
 RETURNS public.user_role
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$ select app_private.current_app_user_role(); $function$;

revoke all on function app_private.current_app_user_role() from public, anon;

grant execute on function app_private.current_app_user_role() to authenticated, service_role;

revoke all on function public.current_app_user_role() from public, anon;

grant execute on function public.current_app_user_role() to authenticated, service_role;

-- Trigger execution does not require callers to have direct EXECUTE privileges.

revoke all on function public.enforce_assignment_photo_limit() from public, anon, authenticated;

-- Trigger execution does not require callers to have direct EXECUTE privileges.

revoke all on function public.set_updated_at() from public, anon, authenticated;

alter function public.set_updated_at() set search_path = pg_catalog, public, pg_temp;

-- Trigger execution does not require callers to have direct EXECUTE privileges.

revoke all on function public.create_reclean_assignment() from public, anon, authenticated;

-- Trigger execution does not require callers to have direct EXECUTE privileges.

revoke all on function public.guard_users_update() from public, anon, authenticated;

-- Existing table policies enforce tenant and administrative role for these mutations.

alter function public.increment_inventory_quantity(uuid,integer) security invoker;

revoke all on function public.increment_inventory_quantity(uuid,integer) from public, anon;

grant execute on function public.increment_inventory_quantity(uuid,integer) to authenticated, service_role;

-- Existing table policies enforce tenant and administrative role for these mutations.

alter function public.recalculate_payout_batch(uuid) security invoker;

revoke all on function public.recalculate_payout_batch(uuid) from public, anon;

grant execute on function public.recalculate_payout_batch(uuid) to authenticated, service_role;

-- Trigger execution does not require callers to have direct EXECUTE privileges.

revoke all on function public.handle_auth_user_created() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.current_owner_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select owner_id from public.users where id = auth.uid() and active
$function$;

CREATE OR REPLACE FUNCTION public.current_owner_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$ select app_private.current_owner_id(); $function$;

revoke all on function app_private.current_owner_id() from public, anon;

grant execute on function app_private.current_owner_id() to authenticated, service_role;

revoke all on function public.current_owner_id() from public, anon;

grant execute on function public.current_owner_id() to authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.is_tenant_admin(row_owner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select row_owner_id = app_private.current_owner_id()
     and app_private.current_app_user_role() in ('owner', 'admin', 'supervisor');
$function$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(row_owner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$ select app_private.is_tenant_admin(row_owner_id); $function$;

revoke all on function app_private.is_tenant_admin(uuid) from public, anon;

grant execute on function app_private.is_tenant_admin(uuid) to authenticated, service_role;

revoke all on function public.is_tenant_admin(uuid) from public, anon;

grant execute on function public.is_tenant_admin(uuid) to authenticated, service_role;

-- Trigger execution does not require callers to have direct EXECUTE privileges.

revoke all on function public.rls_auto_enable() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.can_access_assignment(target_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select exists (
    select 1 from public.assignments
    where id = target_assignment_id
      and (
        (owner_id = app_private.current_owner_id()
          and app_private.current_app_user_role() in ('owner', 'admin', 'supervisor'))
        or (app_private.current_app_user_role() = 'cleaner' and cleaner_id = auth.uid())
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_access_assignment(target_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$ select app_private.can_access_assignment(target_assignment_id); $function$;

revoke all on function app_private.can_access_assignment(uuid) from public, anon;

grant execute on function app_private.can_access_assignment(uuid) to authenticated, service_role;

revoke all on function public.can_access_assignment(uuid) from public, anon;

grant execute on function public.can_access_assignment(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.can_access_property(target_property_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select exists (
    select 1 from public.properties p
    where p.id = target_property_id
      and (
        (p.owner_id = app_private.current_owner_id()
          and app_private.current_app_user_role() in ('owner', 'admin', 'supervisor'))
        or exists (
          select 1 from public.assignments a
          where a.property_id = p.id and a.cleaner_id = auth.uid() and app_private.current_app_user_role() = 'cleaner'
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_access_property(target_property_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$ select app_private.can_access_property(target_property_id); $function$;

revoke all on function app_private.can_access_property(uuid) from public, anon;

grant execute on function app_private.can_access_property(uuid) to authenticated, service_role;

revoke all on function public.can_access_property(uuid) from public, anon;

grant execute on function public.can_access_property(uuid) to authenticated, service_role;

-- Trigger execution does not require callers to have direct EXECUTE privileges.

revoke all on function public.touch_cleaner_access_code_set_at() from public, anon, authenticated;

alter function public.touch_cleaner_access_code_set_at() set search_path = pg_catalog, public, pg_temp;

-- Trigger execution does not require callers to have direct EXECUTE privileges.

revoke all on function public.touch_updated_at() from public, anon, authenticated;

alter function public.touch_updated_at() set search_path = pg_catalog, public, pg_temp;

alter view public.v_exception_counts set (security_invoker = true);

alter view public.v_low_inventory set (security_invoker = true);

alter view public.v_pending_recleans set (security_invoker = true);

commit;
