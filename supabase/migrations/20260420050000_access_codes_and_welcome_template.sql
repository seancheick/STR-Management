-- Sprint G — access codes + guest welcome template
--
-- G-1: per-assignment door/gate code. Hosts rotate codes per booking;
-- the cleaner needs the code to get in. Auto-clears 24h after checkout
-- (left to cron to zero out; optional future work).
-- G-3: per-property welcome template. Owner can pre-fill a warm message
-- to guests covering arrival instructions, WiFi, quiet hours, etc.

alter table public.assignments
  add column if not exists access_code text;

comment on column public.assignments.access_code
  is 'Door/gate code the cleaner needs on-site for this specific job. Rotate per booking.';

alter table public.properties
  add column if not exists guest_welcome_template text;

comment on column public.properties.guest_welcome_template
  is 'Pre-filled guest arrival template: check-in instructions, WiFi, quiet hours, local tips. Used as a starting point for per-booking messages.';
