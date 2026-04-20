-- Sprint F — F-3: mark cleaners as 1099 contractors so annual payout totals
-- can be filtered to just who needs a 1099-NEC.

alter table public.users
  add column if not exists is_1099_contractor boolean not null default false;

comment on column public.users.is_1099_contractor
  is 'True when this cleaner is an independent contractor receiving 1099-NEC. Used to filter the annual payout export.';
