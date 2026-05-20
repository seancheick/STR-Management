-- ────────────────────────────────────────────────────────────────────
-- Tenant branding: name + logo on the owner row
--
-- Owners self-reference (users.owner_id = users.id) so the owner user
-- row is the canonical "workspace" record. Storing tenant_name and
-- tenant_logo_url here keeps a single source of truth and avoids
-- duplicating branding on every team-member row.
--
-- Admin/cleaner/supervisor users keep these columns null; the app
-- reads branding by following users.owner_id → owner row.
-- ────────────────────────────────────────────────────────────────────

alter table public.users
  add column if not exists tenant_name text,
  add column if not exists tenant_logo_url text;

comment on column public.users.tenant_name is
  'Workspace display name shown in the sidebar. Only meaningful for role=owner; null for others.';
comment on column public.users.tenant_logo_url is
  'Public URL of the workspace logo (Supabase Storage tenant-assets bucket). Owner row only.';

-- Optional: backfill the existing tenant with a placeholder so the sidebar
-- has something nice on first load. The owner can change it from settings.
update public.users
set tenant_name = coalesce(tenant_name, split_part(full_name, ' ', 1) || '''s workspace')
where role = 'owner' and tenant_name is null;
