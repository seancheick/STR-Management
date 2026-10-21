begin;
insert into auth.users(id,email) values('a8000000-0000-0000-0000-000000000001','history-owner@test'),('a8000000-0000-0000-0000-000000000002','history-other@test');
update public.users set role='owner',owner_id=id where id in('a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002');
insert into public.properties(id,owner_id,name) values('a8000000-0000-0000-0000-000000000010','a8000000-0000-0000-0000-000000000001','History fixture');
insert into public.property_calendar_sources(id,owner_id,property_id,name,ical_url,active,retired_at) values('a8000000-0000-0000-0000-000000000011','a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000010','Retired','https://example.com/feed',false,now());
insert into public.property_calendar_sources(owner_id,property_id,name,ical_url) values('a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000010','Replacement','https://example.com/feed');
do $$ begin
 begin update public.property_calendar_sources set active=true,retired_at=null where id='a8000000-0000-0000-0000-000000000011'; raise exception 'FAIL reactivation allowed duplicate'; exception when unique_violation then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"a8000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.import_reservation_history('a8000000-0000-0000-0000-000000000020','a8000000-0000-0000-0000-000000000010','airbnb','[{"sourceReference":"Joe","guestName":"Joe Tanzi","checkIn":"2026-05-01","checkOut":"2026-05-03","status":"completed"}]');
select public.import_reservation_history('a8000000-0000-0000-0000-000000000020','a8000000-0000-0000-0000-000000000010','airbnb','[{"sourceReference":"Joe","guestName":"Joe Tanzi","checkIn":"2026-05-01","checkOut":"2026-05-03","status":"completed"}]');
do $$ begin
 if (select count(*) from public.historical_reservations)<>1 then raise exception 'FAIL retry duplicated'; end if;
 if exists(select 1 from public.assignments where property_id='a8000000-0000-0000-0000-000000000010') then raise exception 'FAIL import created cleaning'; end if;
 begin perform public.import_reservation_history('a8000000-0000-0000-0000-000000000021','a8000000-0000-0000-0000-000000000010','airbnb','[{"sourceReference":"good","guestName":"Joe","checkIn":"2026-05-01","checkOut":"2026-05-03","status":"completed"},{"sourceReference":"bad","guestName":"Joe","checkIn":"2026-05-04","checkOut":"2026-05-03","status":"completed"}]'); raise exception 'FAIL invalid row accepted'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 if (select count(*) from public.historical_reservations)<>1 then raise exception 'FAIL invalid batch partially saved'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"a8000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.historical_reservations) then raise exception 'FAIL cross tenant read'; end if;
 begin perform public.import_reservation_history(gen_random_uuid(),'a8000000-0000-0000-0000-000000000010','airbnb','[]'); raise exception 'FAIL cross tenant import'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
rollback;
select 'Reservation history tests passed';
