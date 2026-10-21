begin;
-- Hostex reservations drive cleanings; iCal feeds remain a backup signal.
-- The reservation code links a job to its stay without replacing the iCal
-- source_reference that feed reconciliation still owns.
alter table public.assignments add column hostex_reservation_code text;
-- Set once when Hostex reports a cancellation for a job that can no longer be
-- cancelled automatically (started, completed, past checkout or pay-locked).
alter table public.assignments add column reservation_cancelled_at timestamptz;
create index assignments_hostex_reservation on public.assignments(owner_id,hostex_reservation_code) where hostex_reservation_code is not null;

-- One live automated turnover per physical unit and checkout, whichever signal created it.
drop index public.one_live_feed_cleaning_per_checkout;
create unique index one_live_feed_cleaning_per_checkout
on public.assignments(owner_id,property_id,checkout_at)
where source_type in ('ical','hostex') and assignment_type='cleaning' and status<>'cancelled' and checkout_at is not null;
commit;
