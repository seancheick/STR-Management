-- Close privilege-escalation paths on public.users.
--
-- Before this migration (all reproduced in tests/db/tenant-security.test.sql):
--   * the update policy let any user rewrite their own role / owner_id / active;
--   * supervisors could edit any member of their tenant, including roles;
--   * admins could promote to owner, or demote / deactivate the owner;
--   * deactivated users kept full database access (only the UI checked active);
--   * the signup trigger took role and owner_id from user metadata, which the
--     public signup endpoint lets anyone set.
--
-- Column-level REVOKE does not work here: Supabase grants table-wide UPDATE to
-- `authenticated`, and a column revoke is ignored while a table grant exists.
-- A BEFORE UPDATE trigger enforces the rules instead.

-- 1. Deactivated users get no role and no tenant, so every RLS helper denies them.
create or replace function public.current_app_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid() and active
$$;

create or replace function public.current_owner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select owner_id from public.users where id = auth.uid() and active
$$;

-- 2. Guard who may change what on public.users.
create or replace function public.guard_users_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_role public.user_role;
  profile_columns constant text[] := array['full_name', 'phone', 'availability', 'avatar_url'];
begin
  -- No user id means service role or a direct DB session: trusted server paths
  -- (host signup, invites, branding, migrations).
  if caller is null then
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'A user''s tenant cannot be changed.' using errcode = '42501';
  end if;

  -- Anyone editing their own row may change profile fields only.
  if new.id = caller then
    if (to_jsonb(new) - profile_columns) is distinct from (to_jsonb(old) - profile_columns) then
      raise exception 'You can only change your own name, phone, availability and avatar.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Editing someone else: owners and admins only (RLS already pins the tenant).
  caller_role := public.current_app_user_role();
  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'Only owners and admins can edit team members.' using errcode = '42501';
  end if;

  -- The owner row and the owner role are not editable through the API.
  if old.role = 'owner' or new.role = 'owner' then
    raise exception 'The owner account cannot be changed from here.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_users_update on public.users;
create trigger guard_users_update
before update on public.users
for each row execute function public.guard_users_update();

-- 3. Signup trigger: never trust metadata for role or tenant.
--    Host signup and invites are server actions that set role/owner_id with the
--    service role immediately after the auth user is created. Anything else,
--    including a direct call to the public signup endpoint, gets an isolated
--    single-person tenant with the lowest role.
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.users (id, email, full_name, role, owner_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    -- Very first account on an empty install bootstraps as owner.
    case when exists (select 1 from public.users) then 'cleaner' else 'owner' end::public.user_role,
    new.id
  )
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$function$;
