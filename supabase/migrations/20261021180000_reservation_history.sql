begin;
alter table public.assignments add column booking_channel text check(booking_channel in ('airbnb','booking','vrbo','hostex','other'));
update public.assignments a set booking_channel=r.platform from public.reservations r where a.calendar_source_id=r.calendar_source_id and a.source_reference=r.source_reference and a.owner_id=r.owner_id;

-- Retired rows preserve provenance but no longer reserve a feed URL.
alter table public.property_calendar_sources drop constraint if exists calendar_sources_url_unique;
create unique index calendar_sources_active_url_unique on public.property_calendar_sources(property_id,btrim(ical_url)) where active and retired_at is null;

create table public.historical_reservations (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.users(id),
 property_id uuid not null references public.properties(id), listing_property_id uuid not null references public.properties(id),
 channel text not null check(channel in ('airbnb','booking','vrbo','other')),
 source_reference text not null, guest_name text not null,
 check_in date not null, check_out date not null check(check_out>check_in),
 status text not null check(status in ('confirmed','completed','cancelled','no_show')),
 created_at timestamptz not null default now(),
 unique(owner_id,listing_property_id,channel,source_reference)
);
create index historical_reservations_match on public.historical_reservations(owner_id,property_id,check_out);
alter table public.historical_reservations enable row level security;
create policy "tenant admins read reservation history" on public.historical_reservations for select to authenticated
 using(exists(select 1 from public.users u where u.id=auth.uid() and u.active and u.role in ('owner','admin','supervisor') and u.owner_id=historical_reservations.owner_id));
revoke all on public.historical_reservations from anon,authenticated;
grant select on public.historical_reservations to authenticated;
create table public.reservation_history_imports(
 request_id uuid primary key, owner_id uuid not null references public.users(id), payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
alter table public.reservation_history_imports enable row level security;
revoke all on public.reservation_history_imports from anon,authenticated;

create function public.import_reservation_history(request_id uuid,listing_id uuid,channel_name text,stay_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; listing public.properties%rowtype; previous public.reservation_history_imports%rowtype;
 payload jsonb; item jsonb; result jsonb; n integer:=0;
begin
 select owner_id into tenant from public.users where id=auth.uid() and active and role in ('owner','admin');
 if tenant is null then raise exception 'Only the host can import reservation history.'; end if;
 if request_id is null then raise exception 'An import request ID is required.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,6));
 payload:=jsonb_build_object('listingId',listing_id,'channel',channel_name,'stays',stay_rows);
 select * into previous from public.reservation_history_imports r where r.request_id=import_reservation_history.request_id;
 if previous.request_id is not null then
  if previous.owner_id=tenant and previous.payload=payload then return previous.result; end if;
  raise exception 'Import request ID already used with different details.';
 end if;
 select * into listing from public.properties where id=listing_id and owner_id=tenant;
 if listing.id is null then raise exception 'Listing not found.'; end if;
 if channel_name is null or channel_name not in ('airbnb','booking','vrbo','other') or jsonb_typeof(stay_rows) is distinct from 'array' then raise exception 'Invalid reservation import.'; end if;
 if jsonb_array_length(stay_rows) not between 1 and 5000 then raise exception 'Import between 1 and 5000 stays.'; end if;
 if (select count(distinct value->>'sourceReference') from jsonb_array_elements(stay_rows))<>jsonb_array_length(stay_rows) then raise exception 'Duplicate reservation references in import.'; end if;
 for item in select value from jsonb_array_elements(stay_rows) loop
  if coalesce(length(btrim(item->>'sourceReference')),0) not between 1 and 200 or coalesce(length(btrim(item->>'guestName')),0) not between 1 and 200
   or coalesce(item->>'checkIn','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(item->>'checkOut','') !~ '^\d{4}-\d{2}-\d{2}$'
   or (item->>'status') is null or (item->>'status') not in ('confirmed','completed','cancelled','no_show') or (item->>'checkOut')::date<=(item->>'checkIn')::date then raise exception 'Invalid reservation row.'; end if;
  insert into public.historical_reservations(owner_id,property_id,listing_property_id,channel,source_reference,guest_name,check_in,check_out,status)
  values(tenant,coalesce(listing.physical_unit_id,listing.id),listing.id,channel_name,btrim(item->>'sourceReference'),btrim(item->>'guestName'),(item->>'checkIn')::date,(item->>'checkOut')::date,item->>'status')
  on conflict(owner_id,listing_property_id,channel,source_reference) do update set guest_name=excluded.guest_name,check_in=excluded.check_in,check_out=excluded.check_out,status=excluded.status;
  n:=n+1;
 end loop;
 result:=jsonb_build_object('imported',n,'createsCleanings',false,'createsCharges',false);
 insert into public.reservation_history_imports values(request_id,tenant,payload,result,now());
 return result;
end $$;
revoke all on function public.import_reservation_history(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.import_reservation_history(uuid,uuid,text,jsonb) to authenticated;
commit;
