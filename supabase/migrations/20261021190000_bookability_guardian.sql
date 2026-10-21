begin;
-- Hostex property identity lives on the TurnFlow listing configuration it mirrors.
alter table public.properties add column hostex_property_id bigint;
create unique index properties_hostex_property_unique on public.properties(owner_id,hostex_property_id) where hostex_property_id is not null;
update public.properties p set hostex_property_id=m.hostex from (values
 ('4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a'::uuid,12815776),('0d9f36d7-f530-48f8-b7c4-13f9c030b4d2'::uuid,12815777),
 ('fa83861a-8184-420e-8926-ef56b062c813'::uuid,12815778),('e1ce5551-6cf5-464c-b7b0-2c37e5960910'::uuid,12815779),
 ('efd291a1-35ba-4e94-8c18-0a07c8c2fd95'::uuid,12815775)) m(id,hostex)
where p.id=m.id and p.owner_id='d5b29d86-8e21-444b-8524-901e2107d96b';

-- One row per channel calendar (Airbnb listing or Booking.com rate plan).
create table public.channel_listings(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.users(id),
 hostex_property_id bigint not null, property_id uuid, property_title text not null,
 channel_type text not null, listing_id text not null, currency text not null,
 pricing_authority text not null default 'manual' check(pricing_authority in ('pricelabs','turnflow','manual')),
 intentionally_closed boolean not null default false,
 expected_ratio numeric(6,4) check(expected_ratio>0),
 authority_changed_at timestamptz not null default now(),
 price_snapshot jsonb, prices_changed_at timestamptz, last_verified_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,channel_type,listing_id),
 foreign key(owner_id,property_id) references public.properties(owner_id,id)
);
-- Staleness grace restarts when an owner hands a calendar to a new pricing authority.
create function public.touch_channel_listing_authority() returns trigger language plpgsql set search_path='' as $$
begin
 new.updated_at:=now();
 if new.pricing_authority is distinct from old.pricing_authority then new.authority_changed_at:=now(); end if;
 return new;
end $$;
create trigger channel_listing_authority before update on public.channel_listings for each row execute function public.touch_channel_listing_authority();
create table public.bookability_scans(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.users(id),
 started_at timestamptz not null default now(), finished_at timestamptz,
 result text check(result in ('success','failed')), error text,
 listings_scanned integer, horizon_days integer not null
);
create index bookability_scans_recent on public.bookability_scans(owner_id,started_at desc);
-- One open finding per listing and rule; detail carries the affected date ranges.
create table public.bookability_findings(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.users(id),
 subject text not null, channel_type text, rule text not null, -- subject: listing id, pricing authority or 'hostex'
 severity text not null check(severity in ('critical','warning','info')),
 start_date date, end_date date, detail jsonb not null default '{}',
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), resolved_at timestamptz
);
create unique index bookability_findings_open on public.bookability_findings(owner_id,rule,coalesce(channel_type,''),subject) where resolved_at is null;

alter table public.channel_listings enable row level security;
alter table public.bookability_scans enable row level security;
alter table public.bookability_findings enable row level security;
revoke all on public.channel_listings, public.bookability_scans, public.bookability_findings from anon,authenticated;
create policy "tenant admins read channel listings" on public.channel_listings for select to authenticated
 using(exists(select 1 from public.users u where u.id=auth.uid() and u.active and u.role in ('owner','admin') and u.owner_id=channel_listings.owner_id));
create policy "tenant admins configure channel listings" on public.channel_listings for update to authenticated
 using(exists(select 1 from public.users u where u.id=auth.uid() and u.active and u.role in ('owner','admin') and u.owner_id=channel_listings.owner_id))
 with check(exists(select 1 from public.users u where u.id=auth.uid() and u.active and u.role in ('owner','admin') and u.owner_id=channel_listings.owner_id));
create policy "tenant admins read bookability scans" on public.bookability_scans for select to authenticated
 using(exists(select 1 from public.users u where u.id=auth.uid() and u.active and u.role in ('owner','admin') and u.owner_id=bookability_scans.owner_id));
create policy "tenant admins read bookability findings" on public.bookability_findings for select to authenticated
 using(exists(select 1 from public.users u where u.id=auth.uid() and u.active and u.role in ('owner','admin') and u.owner_id=bookability_findings.owner_id));
grant select on public.channel_listings, public.bookability_scans, public.bookability_findings to authenticated;
-- Owners only change the settings they own; scan data is written by the service role.
grant update(pricing_authority,intentionally_closed,expected_ratio) on public.channel_listings to authenticated;
commit;
