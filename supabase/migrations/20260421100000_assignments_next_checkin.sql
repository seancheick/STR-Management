-- The cleaning is always anchored to the CHECKOUT day (guest leaves → cleaning
-- begins). The next guest's check-in is metadata used to detect tight turns,
-- never a reason to move the cleaning off the checkout day. A last-minute
-- booking must never leave a host without a scheduled cleaner.

alter table public.assignments
  add column if not exists next_checkin_at timestamptz;

comment on column public.assignments.next_checkin_at is
  'Upcoming guest check-in (from iCal pairing). Null for manual jobs and for the last booking in a feed. Used for tight-turn detection only.';

create index if not exists idx_assignments_property_checkout
  on public.assignments (property_id, checkout_at);
