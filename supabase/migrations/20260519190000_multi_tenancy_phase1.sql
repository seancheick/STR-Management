-- ────────────────────────────────────────────────────────────────────
-- Multi-tenancy Phase 1 + 5: schema + backfill (atomic)
--
-- Adds public.users.owner_id, the helper functions current_owner_id()
-- and is_tenant_admin(), backfills every existing user so the column
-- can flip to NOT NULL in the same transaction. RLS rewrites land in
-- the Phase 2 migration that runs right after this one.
--
-- For owner-role users, owner_id equals their own id (they ARE the
-- tenant). For admin/supervisor/cleaner, owner_id points to the owner
-- they belong to. Cascade delete so wiping a tenant takes its team
-- with it.
-- ────────────────────────────────────────────────────────────────────

-- 1. Add the column nullable so the backfill can run before NOT NULL.
alter table public.users
  add column if not exists owner_id uuid references public.users (id) on delete cascade;

create index if not exists idx_users_owner_id on public.users (owner_id);

comment on column public.users.owner_id is
  'The tenant this user belongs to. For role=owner, equals id (self). For all other roles, the owner user id that hired them.';

-- 2. Backfill: every owner is its own tenant.
update public.users
set owner_id = id
where role = 'owner' and owner_id is null;

-- 3. Backfill: non-owner users belong to the first active owner
--    (single-tenant pre-history — for production-time multi-tenant
--    onboarding the invite flow will set owner_id explicitly).
with primary_owner as (
  select id from public.users
  where role = 'owner' and active = true
  order by created_at asc
  limit 1
)
update public.users u
set owner_id = (select id from primary_owner)
where u.role <> 'owner' and u.owner_id is null;

-- 4. Sanity: zero rows should remain without a tenant.
do $$
declare orphans int;
begin
  select count(*) into orphans from public.users where owner_id is null;
  if orphans > 0 then
    raise exception 'Backfill incomplete: % users without owner_id', orphans;
  end if;
end$$;

-- 5. Lock it down.
alter table public.users alter column owner_id set not null;

-- 6. Helper: which tenant is the current request acting as?
create or replace function public.current_owner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select owner_id from public.users where id = auth.uid();
$$;

-- 7. Helper: does the caller have admin-level powers AND does the row
--    they're touching belong to their tenant?
create or replace function public.is_tenant_admin(row_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select row_owner_id = public.current_owner_id()
     and public.current_app_user_role() in ('owner', 'admin', 'supervisor');
$$;
