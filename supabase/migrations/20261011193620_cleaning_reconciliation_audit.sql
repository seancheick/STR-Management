-- Link the canonical completed job to its reconciled financial source.
alter table public.assignments add column ledger_entry_id uuid references public.cleaner_ledger_entries(id) on delete restrict;
create unique index assignments_ledger_entry_unique on public.assignments(ledger_entry_id) where ledger_entry_id is not null;
create table public.ops_reconciliation_audit (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.users(id),
 run_key text not null,
 table_name text not null,
 row_id uuid not null,
 before_record jsonb not null,
 recorded_at timestamptz not null default now(),
 unique(run_key,table_name,row_id)
);
create index ops_reconciliation_owner on public.ops_reconciliation_audit(owner_id);
alter table public.ops_reconciliation_audit enable row level security;
revoke all on public.ops_reconciliation_audit from anon,authenticated;
grant select on public.ops_reconciliation_audit to authenticated;
grant all on public.ops_reconciliation_audit to service_role;
create policy reconciliation_audit_read on public.ops_reconciliation_audit for select to authenticated
using (owner_id=(select public.current_owner_id()) and (select public.current_app_user_role()) in ('owner','admin','supervisor'));
-- Prevent an editable listing from being linked to another tenant's property.
alter table public.properties add constraint properties_owner_id_identity unique(owner_id,id);
alter table public.properties drop constraint properties_physical_unit_id_fkey;
alter table public.properties add constraint physical_unit_same_owner foreign key(owner_id,physical_unit_id) references public.properties(owner_id,id) on delete restrict;
