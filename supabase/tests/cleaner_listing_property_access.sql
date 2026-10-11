-- Read-only, live-data integration test: both property identities for each own job.
begin;
create temporary table listing_access_cases as
select u.id cleaner_id,a.owner_id,a.property_id,a.listing_property_id
from public.assignments a join public.users u on u.id=a.cleaner_id
where u.role='cleaner' and u.active and u.owner_id=a.owner_id;
grant select on listing_access_cases to authenticated;
set local role authenticated;
do $test$
declare c record; p record;
begin
 if not exists(select 1 from listing_access_cases where listing_property_id is not null and listing_property_id<>property_id) then raise exception 'Requires a real aliased listing job'; end if;
 for c in select distinct cleaner_id from listing_access_cases loop
  perform set_config('request.jwt.claim.sub',c.cleaner_id::text,true);
  for p in select property_id,listing_property_id from listing_access_cases where cleaner_id=c.cleaner_id loop
   if not public.can_access_property(p.property_id) or not exists(select 1 from public.properties where id=p.property_id) then raise exception 'Operational root denied'; end if;
   if p.listing_property_id is not null and (not public.can_access_property(p.listing_property_id) or not exists(select 1 from public.properties where id=p.listing_property_id)) then raise exception 'Assigned listing configuration denied'; end if;
  end loop;
 end loop;
end $test$;
reset role;
-- Privileged enumeration supplies negative cases that RLS would otherwise hide.
do $test$
declare c record; p record; allowed boolean;
begin
 for c in select distinct cleaner_id from listing_access_cases loop
  perform set_config('request.jwt.claim.sub',c.cleaner_id::text,true);
  for p in select id,owner_id from public.properties loop
   select exists(select 1 from listing_access_cases a where a.cleaner_id=c.cleaner_id and a.owner_id=p.owner_id and (a.property_id=p.id or a.listing_property_id=p.id)) into allowed;
   if public.can_access_property(p.id) is distinct from allowed then raise exception 'Unrelated or cross-tenant listing authorization mismatch'; end if;
  end loop;
 end loop;
end $test$;
select 'cleaner listing/root allow and unrelated/cross-tenant deny passed' as result;
rollback;
