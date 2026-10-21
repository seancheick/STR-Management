begin;
-- Hostex pricing ratios: readonly plans are priced by the channel itself and reject API price pushes.
alter table public.channel_listings add column listing_title text, add column price_readonly boolean, add column hostex_ratio integer;

-- Owner-approved Hostex calendar writes. request_id makes retries idempotent;
-- before keeps the prior values so a change can be reversed with a new request.
create table public.calendar_change_requests(
 request_id uuid primary key, owner_id uuid not null references public.users(id),
 channel_type text not null, listing_id text not null,
 kind text not null check(kind in ('price','restrictions')),
 payload jsonb not null, before jsonb not null,
 status text not null check(status in ('submitted','verified','mismatch','failed')),
 error text, mismatches jsonb, requested_by uuid references public.users(id),
 submitted_at timestamptz not null default now(), verified_at timestamptz
);
create index calendar_change_requests_listing on public.calendar_change_requests(owner_id,channel_type,listing_id,submitted_at desc);
alter table public.calendar_change_requests enable row level security;
revoke all on public.calendar_change_requests from anon,authenticated;
create policy "tenant admins read calendar changes" on public.calendar_change_requests for select to authenticated
 using(exists(select 1 from public.users u where u.id=auth.uid() and u.active and u.role in ('owner','admin') and u.owner_id=calendar_change_requests.owner_id));
grant select on public.calendar_change_requests to authenticated;
commit;
