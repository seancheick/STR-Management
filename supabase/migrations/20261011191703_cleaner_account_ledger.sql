-- A reconciled opening history replaces legacy job-level payment assumptions
-- through reconciled_through. Later work continues in assignments/payouts.
create table public.cleaner_accounts (
  cleaner_id uuid primary key references public.users(id),
  owner_id uuid not null references public.users(id),
  label text not null,
  reconciled_through date not null,
  source_note text not null,
  unique(cleaner_id, owner_id)
);
create table public.cleaner_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null,
  owner_id uuid not null,
  entry_date date not null,
  sequence integer not null,
  kind text not null check (kind in ('cleaning','adjustment','payment')),
  description text not null,
  amount numeric(12,2) not null check (amount <> 0),
  source_key text not null,
  foreign key(cleaner_id, owner_id) references public.cleaner_accounts(cleaner_id, owner_id),
  unique(cleaner_id, source_key),
  check ((kind = 'payment' and amount < 0) or (kind <> 'payment' and amount > 0))
);
create index cleaner_ledger_order on public.cleaner_ledger_entries(cleaner_id, entry_date, sequence, id);
alter table public.cleaner_accounts enable row level security;
alter table public.cleaner_ledger_entries enable row level security;
revoke all on public.cleaner_accounts, public.cleaner_ledger_entries from anon, authenticated;
grant select on public.cleaner_accounts, public.cleaner_ledger_entries to authenticated;
grant all on public.cleaner_accounts, public.cleaner_ledger_entries to service_role;
create policy cleaner_accounts_read on public.cleaner_accounts for select to authenticated
using (owner_id = public.current_owner_id() and (cleaner_id = auth.uid() or public.current_app_user_role() in ('owner','admin','supervisor')));
create policy cleaner_ledger_read on public.cleaner_ledger_entries for select to authenticated
using (owner_id = public.current_owner_id() and (cleaner_id = auth.uid() or public.current_app_user_role() in ('owner','admin','supervisor')));
