-- TurnFlow early access capture: operators interested in the product drop
-- their email + portfolio size so we can onboard qualified users first.

create table if not exists public.early_access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  property_count text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  contacted_at timestamptz,
  constraint early_access_requests_email_key unique (email)
);

create index if not exists idx_early_access_requests_created_at
  on public.early_access_requests (created_at desc);

alter table public.early_access_requests enable row level security;

-- Admins can read + mark contacted. Inserts come from the public landing page
-- via the service-role client in a server action, so no public insert policy.
drop policy if exists "admins read early access" on public.early_access_requests;
create policy "admins read early access"
on public.early_access_requests
for select
to authenticated
using (public.is_admin_role());

drop policy if exists "admins update early access" on public.early_access_requests;
create policy "admins update early access"
on public.early_access_requests
for update
to authenticated
using (public.is_admin_role())
with check (public.is_admin_role());
