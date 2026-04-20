-- Sprint E — E-1: recurring maintenance tasks (quarterly deep clean,
-- annual HVAC filter change, etc.) that are not driven by guest bookings.
-- A cron worker materialises the next instance into an assignment when
-- next_run_at passes.

create table if not exists public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete restrict,
  property_id uuid not null references public.properties (id) on delete cascade,
  title text not null,
  description text,
  cadence text not null check (cadence in ('weekly', 'monthly', 'quarterly', 'annual')),
  next_run_at timestamptz not null,
  assignee_id uuid references public.users (id) on delete set null,
  primary_checklist_template_id uuid references public.checklist_templates (id) on delete set null,
  fixed_payout_amount numeric(10, 2),
  expected_duration_min integer,
  active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_recurring_tasks_next_run
  on public.recurring_tasks (next_run_at)
  where active = true;
create index if not exists idx_recurring_tasks_property
  on public.recurring_tasks (property_id);

alter table public.recurring_tasks enable row level security;

drop policy if exists "admins can read recurring tasks" on public.recurring_tasks;
create policy "admins can read recurring tasks"
on public.recurring_tasks
for select
to authenticated
using (public.is_admin_role());

drop policy if exists "admins can manage recurring tasks" on public.recurring_tasks;
create policy "admins can manage recurring tasks"
on public.recurring_tasks
for all
to authenticated
using (public.is_admin_role())
with check (public.is_admin_role());
