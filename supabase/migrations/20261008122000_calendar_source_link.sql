-- Record which calendar source produced each imported assignment/reservation,
-- so a sync can cancel bookings that disappeared from ITS feed without
-- touching rows from another feed on the same property (e.g. Airbnb + VRBO).
alter table public.assignments
  add column if not exists calendar_source_id uuid
    references public.property_calendar_sources (id) on delete set null;
alter table public.reservations
  add column if not exists calendar_source_id uuid
    references public.property_calendar_sources (id) on delete set null;

create index if not exists idx_assignments_calendar_source
  on public.assignments (calendar_source_id) where calendar_source_id is not null;
create index if not exists idx_reservations_calendar_source
  on public.reservations (calendar_source_id) where calendar_source_id is not null;

-- Backfill only where the source is unambiguous: the property has exactly one
-- calendar source. Other rows are stamped by the next sync of the feed that
-- still contains them; unstamped rows are never auto-cancelled.
with single_source as (
  select property_id, min(id::text)::uuid as source_id
  from public.property_calendar_sources
  group by property_id
  having count(*) = 1
)
update public.assignments a
set calendar_source_id = s.source_id
from single_source s
where a.property_id = s.property_id
  and a.source_type = 'ical'
  and a.calendar_source_id is null;

with single_source as (
  select property_id, min(id::text)::uuid as source_id
  from public.property_calendar_sources
  group by property_id
  having count(*) = 1
)
update public.reservations r
set calendar_source_id = s.source_id
from single_source s
where r.property_id = s.property_id
  and r.source_type = 'ical'
  and r.calendar_source_id is null;
