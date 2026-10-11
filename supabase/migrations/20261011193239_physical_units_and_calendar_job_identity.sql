-- Booking configurations can share a real cleaning unit. NULL means this
-- property is itself the physical unit; source listings retain their IDs.
alter table public.properties add column physical_unit_id uuid references public.properties(id) on delete restrict;
create index properties_physical_unit on public.properties(physical_unit_id) where physical_unit_id is not null;
-- Same normalized checkout from two feeds must not create two live turnovers.
-- Added after cleanup by the reconciliation import, so historical duplicates
-- are retained as cancelled audit records rather than breaking deployment.
