-- Per-job paid tracking, independent of batch payouts. Hosts who pay via
-- Zelle / Venmo / cash need a quick "mark paid" on a single job without
-- opening a payout batch. Batch payouts continue to work alongside this.

alter table public.assignments
  add column if not exists paid_at timestamptz,
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('zelle','venmo','cash','check','bank_transfer','other')),
  add column if not exists payment_reference text,
  add column if not exists marked_paid_by_user_id uuid references public.users (id) on delete set null;

comment on column public.assignments.paid_at is 'When the host marked this job as paid (outside the batch-payout system).';
comment on column public.assignments.payment_method is 'How the host paid the cleaner: zelle / venmo / cash / check / bank_transfer / other.';
comment on column public.assignments.payment_reference is 'Optional reference the host typed in (confirmation number, last 4, memo).';

create index if not exists idx_assignments_paid_at on public.assignments (paid_at)
  where paid_at is not null;
