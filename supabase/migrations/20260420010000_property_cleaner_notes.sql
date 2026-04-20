-- Sprint A — A-1: property-level free-text notes visible to the assigned cleaner
--
-- Typical use: WiFi password, lockbox/gate code, linen closet location,
-- trash-day quirks, hot-tub chemistry, garage access. Surfaced at the top
-- of the cleaner's job detail so they can reference it on-site.

alter table public.properties
  add column if not exists cleaner_notes text;

comment on column public.properties.cleaner_notes
  is 'Operating notes visible to the assigned cleaner on their job detail. WiFi, codes, linen location, quirks, etc.';
