-- ────────────────────────────────────────────────────────────────────
-- Multi-tenancy Phase 4 patch: amend handle_auth_user_created() so
-- new signups + invites compute owner_id correctly.
--
-- After Phase 1 made public.users.owner_id NOT NULL, every call to
-- supabase.auth.admin.createUser() / inviteUserByEmail() broke because
-- the trigger that auto-mints the public.users row didn't know about
-- the new column.
--
-- New behaviour:
--   - If raw_user_meta_data carries owner_id (invite flow stamps it):
--     use that exact tenant id (and trust that the inviting code stamped
--     a tenant it belongs to — the public.users update layer can't see
--     auth.uid() to double-check).
--   - Else if metadata role is 'owner' (host self-signup): self-tenant.
--   - Else if no users exist yet (cold-start the very first install):
--     bootstrap as self-tenant.
--   - Else fall back to the legacy single-tenant primary owner so
--     existing seed flows continue to work in dev.
-- ────────────────────────────────────────────────────────────────────

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  bootstrap_role public.user_role;
  resolved_owner_id uuid;
begin
  select case
    when new.raw_user_meta_data ->> 'role' in ('owner', 'admin', 'supervisor', 'cleaner')
      then (new.raw_user_meta_data ->> 'role')::public.user_role
    when not exists (select 1 from public.users)
      then 'owner'::public.user_role
    else 'cleaner'::public.user_role
  end
  into bootstrap_role;

  -- 1. Explicit tenant id from invite metadata wins.
  if new.raw_user_meta_data ? 'owner_id' then
    begin
      resolved_owner_id := (new.raw_user_meta_data ->> 'owner_id')::uuid;
    exception when others then
      resolved_owner_id := null;
    end;
  end if;

  -- 2. New owners self-reference.
  if resolved_owner_id is null and bootstrap_role = 'owner' then
    resolved_owner_id := new.id;
  end if;

  -- 3. Legacy single-tenant fallback: attach to the first active owner.
  if resolved_owner_id is null then
    select id into resolved_owner_id
    from public.users
    where role = 'owner' and active = true
    order by created_at asc
    limit 1;
  end if;

  -- 4. Absolute last resort (no owners yet, role is not 'owner'): bootstrap
  --    this user as the first owner themselves rather than 500-ing.
  if resolved_owner_id is null then
    resolved_owner_id := new.id;
    bootstrap_role := 'owner';
  end if;

  insert into public.users (id, email, full_name, role, owner_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    bootstrap_role,
    resolved_owner_id
  )
  on conflict (id) do update
  set email = excluded.email,
      owner_id = coalesce(public.users.owner_id, excluded.owner_id);

  return new;
end;
$function$;
