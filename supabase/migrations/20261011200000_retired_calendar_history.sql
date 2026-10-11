-- Retired feeds retain genuine past reservations without reviving stale futures.
alter table public.property_calendar_sources add column retired_at timestamptz;
update public.property_calendar_sources old_source set retired_at=coalesce((
 select min(r.start_at) from public.reservations r
 join public.property_calendar_sources live_source on live_source.id=r.calendar_source_id and live_source.active
 join public.properties live_listing on live_listing.id=live_source.property_id
 join public.properties old_listing on old_listing.id=old_source.property_id
 where live_source.owner_id=old_source.owner_id
 and coalesce(live_listing.physical_unit_id,live_listing.id)=coalesce(old_listing.physical_unit_id,old_listing.id)
),now()) where not old_source.active;
