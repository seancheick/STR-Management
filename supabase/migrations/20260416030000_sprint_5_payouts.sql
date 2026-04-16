-- Sprint 5: Payouts + Reports
-- Tables: payout_batches, payout_entries

-- ─── Enums ───────────────────────────────────────────────────────────────────

create type public.payout_batch_status as enum ('draft', 'approved', 'paid', 'cancelled');
create type public.payout_entry_status as enum ('included', 'excluded', 'disputed');

-- ─── Payout Batches ───────────────────────────────────────────────────────────

create table public.payout_batches (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.users (id) on delete restrict,
  label           text not null,
  period_start    date not null,
  period_end      date not null,
  cleaner_filter  uuid references public.users (id) on delete set null, -- null = all cleaners
  status          public.payout_batch_status not null default 'draft',
  total_amount    numeric(12,2) not null default 0,
  entry_count     integer not null default 0,
  notes           text,
  approved_at     timestamptz,
  approved_by_id  uuid references public.users (id) on delete set null,
  paid_at         timestamptz,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now())
);

create index idx_payout_batches_owner_id    on public.payout_batches (owner_id);
create index idx_payout_batches_status      on public.payout_batches (status);
create index idx_payout_batches_period      on public.payout_batches (period_start, period_end);

-- ─── Payout Entries ──────────────────────────────────────────────────────────

create table public.payout_entries (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references public.payout_batches (id) on delete cascade,
  owner_id        uuid not null references public.users (id) on delete restrict,
  cleaner_id      uuid not null references public.users (id) on delete restrict,
  assignment_id   uuid not null references public.assignments (id) on delete restrict,
  property_id     uuid not null references public.properties (id) on delete restrict,
  amount          numeric(10,2) not null,
  status          public.payout_entry_status not null default 'included',
  notes           text,
  created_at      timestamptz not null default timezone('utc', now()),
  constraint payout_entries_assignment_unique unique (batch_id, assignment_id)
);

create index idx_payout_entries_batch_id      on public.payout_entries (batch_id);
create index idx_payout_entries_cleaner_id    on public.payout_entries (cleaner_id);
create index idx_payout_entries_assignment_id on public.payout_entries (assignment_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

create trigger payout_batches_updated_at
  before update on public.payout_batches
  for each row execute function public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.payout_batches enable row level security;
alter table public.payout_entries  enable row level security;

create policy "payout_batches_owner_all" on public.payout_batches
  for all
  using (owner_id = auth.uid() or public.current_app_user_role() in ('admin', 'supervisor'));

create policy "payout_entries_owner_all" on public.payout_entries
  for all
  using (owner_id = auth.uid() or public.current_app_user_role() in ('admin', 'supervisor'));

-- Cleaners can read their own entries
create policy "payout_entries_cleaner_read" on public.payout_entries
  for select
  using (
    public.current_app_user_role() = 'cleaner'
    and cleaner_id = auth.uid()
    and batch_id in (
      select id from public.payout_batches where status in ('approved', 'paid')
    )
  );

-- ─── Helper: recalculate batch totals ────────────────────────────────────────

create or replace function public.recalculate_payout_batch(p_batch_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.payout_batches
  set
    total_amount = (
      select coalesce(sum(amount), 0)
      from public.payout_entries
      where batch_id = p_batch_id and status = 'included'
    ),
    entry_count = (
      select count(*)
      from public.payout_entries
      where batch_id = p_batch_id and status = 'included'
    ),
    updated_at = timezone('utc', now())
  where id = p_batch_id;
$$;
