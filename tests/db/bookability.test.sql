begin;
insert into auth.users(id,email) values('a9000000-0000-0000-0000-000000000001','guard-owner@test'),('a9000000-0000-0000-0000-000000000002','guard-other@test'),('a9000000-0000-0000-0000-000000000003','guard-cleaner@test');
update public.users set role='owner',owner_id=id where id in('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000002');
update public.users set role='cleaner',owner_id='a9000000-0000-0000-0000-000000000001' where id='a9000000-0000-0000-0000-000000000003';
insert into public.channel_listings(id,owner_id,hostex_property_id,property_title,channel_type,listing_id,currency,authority_changed_at)
 values('a9000000-0000-0000-0000-000000000010','a9000000-0000-0000-0000-000000000001',1,'Fixture','booking.com','1-2','USD','2026-01-01');
insert into public.bookability_scans(owner_id,horizon_days,result) values('a9000000-0000-0000-0000-000000000001',180,'success');
insert into public.bookability_findings(owner_id,subject,channel_type,rule,severity) values('a9000000-0000-0000-0000-000000000001','1-2','booking.com','missing_price','critical');
insert into public.calendar_change_requests(request_id,owner_id,channel_type,listing_id,kind,payload,before,status) values('a9000000-0000-0000-0000-000000000020','a9000000-0000-0000-0000-000000000001','booking.com','1-2','price','{}','{}','submitted');
do $$ begin
 begin insert into public.bookability_findings(owner_id,subject,channel_type,rule,severity) values('a9000000-0000-0000-0000-000000000001','1-2','booking.com','missing_price','critical'); raise exception 'FAIL duplicate open finding'; exception when unique_violation then null; end;
 if (select pricing_authority from public.channel_listings where id='a9000000-0000-0000-0000-000000000010')<>'manual' then raise exception 'FAIL authority not seeded manual'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
update public.channel_listings set pricing_authority='pricelabs',expected_ratio=0.77 where id='a9000000-0000-0000-0000-000000000010';
do $$ begin
 if (select count(*) from public.bookability_findings)<>1 or (select count(*) from public.bookability_scans)<>1 then raise exception 'FAIL owner cannot read'; end if;
 if (select authority_changed_at from public.channel_listings)<now()-interval '1 minute' then raise exception 'FAIL authority change did not restart grace'; end if;
 begin update public.channel_listings set prices_changed_at=now(); raise exception 'FAIL owner wrote scan data'; exception when insufficient_privilege then null; end;
 begin update public.bookability_findings set resolved_at=now(); raise exception 'FAIL owner resolved finding'; exception when insufficient_privilege then null; end;
 begin insert into public.bookability_scans(owner_id,horizon_days) values('a9000000-0000-0000-0000-000000000001',1); raise exception 'FAIL owner forged scan'; exception when insufficient_privilege then null; end;
 if (select count(*) from public.calendar_change_requests)<>1 then raise exception 'FAIL owner cannot read calendar changes'; end if;
 begin update public.calendar_change_requests set status='verified'; raise exception 'FAIL owner forged verification'; exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"a9000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
update public.channel_listings set pricing_authority='turnflow';
do $$ begin
 if exists(select 1 from public.channel_listings) or exists(select 1 from public.bookability_findings) or exists(select 1 from public.bookability_scans) or exists(select 1 from public.calendar_change_requests) then raise exception 'FAIL cross tenant read'; end if;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"a9000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.channel_listings) or exists(select 1 from public.bookability_findings) then raise exception 'FAIL cleaner read'; end if;
end $$;
reset role;
do $$ begin
 if (select pricing_authority from public.channel_listings)<>'pricelabs' then raise exception 'FAIL other tenant changed authority'; end if;
end $$;
rollback;
select 'Bookability guardian tests passed';
