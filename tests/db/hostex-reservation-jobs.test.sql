begin;
insert into auth.users(id,email) values('a9000000-0000-0000-0000-000000000001','hostex-owner@test');
update public.users set role='owner',owner_id=id where id='a9000000-0000-0000-0000-000000000001';
insert into public.properties(id,owner_id,name) values('a9000000-0000-0000-0000-000000000010','a9000000-0000-0000-0000-000000000001','Hostex fixture');
insert into public.assignments(owner_id,property_id,due_at,checkout_at,source_type,source_reference) values
 ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000010','2030-01-01T20:00Z','2030-01-01T16:00Z','ical','ical:feed-uid');
do $$ begin
 -- A Hostex-created job may never duplicate the live feed job for the same unit and checkout.
 begin
  insert into public.assignments(owner_id,property_id,due_at,checkout_at,source_type,source_reference,hostex_reservation_code) values
   ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000010','2030-01-01T20:00Z','2030-01-01T16:00Z','hostex','hostex:HM1','HM1');
  raise exception 'FAIL duplicate hostex turnover accepted';
 exception when unique_violation then null; end;
 update public.assignments set status='cancelled' where source_reference='ical:feed-uid';
 insert into public.assignments(owner_id,property_id,due_at,checkout_at,source_type,source_reference,hostex_reservation_code) values
  ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000010','2030-01-01T20:00Z','2030-01-01T16:00Z','hostex','hostex:HM1','HM1');
 -- Manual jobs stay outside the automated-turnover guard.
 insert into public.assignments(owner_id,property_id,due_at,checkout_at,source_type) values
  ('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000010','2030-01-01T20:00Z','2030-01-01T16:00Z','manual');
 update public.assignments set reservation_cancelled_at=now() where hostex_reservation_code='HM1';
 if (select count(*) from public.assignments where reservation_cancelled_at is not null)<>1 then raise exception 'FAIL cancellation flag not stored'; end if;
end $$;
insert into public.reservations(owner_id,property_id,listing_property_id,source_type,source_reference,platform,start_at,end_at)
 values('a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000010','a9000000-0000-0000-0000-000000000010','hostex','hostex:HM1','airbnb','2029-12-30T20:00Z','2030-01-01T16:00Z');
rollback;
select 'Hostex reservation job tests passed';
