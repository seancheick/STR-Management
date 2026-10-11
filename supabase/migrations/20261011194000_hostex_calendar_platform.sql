-- Hostex is an explicit source platform; preserve its identity in reservations.
alter table public.reservations drop constraint if exists reservations_platform_check;
alter table public.reservations add constraint reservations_platform_check
  check (platform in ('airbnb', 'vrbo', 'booking', 'hostex', 'other'));

-- Calendar sources originally had no platform check. Keep the same contract.
alter table public.property_calendar_sources drop constraint if exists property_calendar_sources_platform_check;
alter table public.property_calendar_sources add constraint property_calendar_sources_platform_check
  check (platform in ('airbnb', 'vrbo', 'booking', 'hostex', 'other'));
