-- T8.1 + T8.2 — per-property timezone override + per-entry paid toggle

-- ─── T8.1: property-level IANA timezone (optional override)
-- Falls back to a single app default (America/New_York) in app code when null.
alter table public.properties
  add column if not exists timezone text;

comment on column public.properties.timezone
  is 'IANA timezone (e.g., America/New_York). When set, iCal sync anchors checkout/check-in to this TZ. Null means use app default.';

-- ─── T8.2: per-entry payment tracking
-- Hosts want to mark individual jobs paid/pending inside a report instead of
-- having only the report-level "paid" state. These are separate from entry.status
-- (included/excluded/disputed) which is about whether the job counts toward the report total.
alter table public.payout_entries
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by_id uuid references public.users (id) on delete set null;

comment on column public.payout_entries.paid_at
  is 'When the cleaner was paid for this specific job. Null means unpaid.';
