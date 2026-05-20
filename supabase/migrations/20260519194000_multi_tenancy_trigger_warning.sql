-- Phase 4 polish: raise a Postgres NOTICE/WARNING when the auth-user trigger
-- falls back to the "legacy primary owner" branch. That branch was a
-- dev/seed convenience — under normal operation (host signup or invite)
-- it should never fire. If it does in production, somebody created an auth
-- user without role metadata, and silently attaching them to the first
-- active owner could cross-contaminate tenants.

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
  --    Raise a warning so log scrapers can alert; this should never happen
  --    in production once signups are fully metadata-driven.
  if resolved_owner_id is null then
    select id into resolved_owner_id
    from public.users
    where role = 'owner' and active = true
    order by created_at asc
    limit 1;
    if resolved_owner_id is not null then
      raise warning 'handle_auth_user_created: falling back to primary owner % for user % (%, role %)',
        resolved_owner_id, new.id, new.email, bootstrap_role;
    end if;
  end if;

  -- 4. Absolute last resort (no owners yet): bootstrap as the first owner.
  if resolved_owner_id is null then
    resolved_owner_id := new.id;
    bootstrap_role := 'owner';
    raise notice 'handle_auth_user_created: cold-start bootstrap, % becomes first owner', new.id;
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
