-- Full reservations (not just derived cleaning jobs). Stores every VEVENT
-- from the iCal feed so the calendar can draw multi-day booking stripes
-- alongside the cleaning pills.

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete restrict,
  property_id uuid not null references public.properties (id) on delete cascade,
  source_type text not null default 'ical',
  source_reference text not null,
  platform text not null default 'other' check (platform in ('airbnb', 'vrbo', 'booking', 'other')),
  guest_name text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  summary text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reservations_source_reference_unique unique (property_id, source_reference)
);

create index if not exists idx_reservations_property_range
  on public.reservations (property_id, start_at, end_at);
create index if not exists idx_reservations_owner_range
  on public.reservations (owner_id, start_at, end_at);

alter table public.reservations enable row level security;

drop policy if exists "admins read reservations" on public.reservations;
create policy "admins read reservations"
on public.reservations
for select
to authenticated
using (public.is_admin_role());

drop policy if exists "admins manage reservations" on public.reservations;
create policy "admins manage reservations"
on public.reservations
for all
to authenticated
using (public.is_admin_role())
with check (public.is_admin_role());

-- Updated_at trigger (reuses existing helper if present; define if not)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_reservations_updated_at on public.reservations;
create trigger trg_reservations_updated_at
before update on public.reservations
for each row
execute function public.touch_updated_at();
