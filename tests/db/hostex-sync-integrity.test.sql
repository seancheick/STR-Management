begin;
insert into auth.users(id,email) values('aa000000-0000-0000-0000-000000000001','hostex-integrity@test');
update public.users set role='owner',owner_id=id where id='aa000000-0000-0000-0000-000000000001';
insert into public.checklist_templates(id,owner_id,name) values('aa000000-0000-0000-0000-000000000020','aa000000-0000-0000-0000-000000000001','Hostex checklist');
insert into public.checklist_template_items(id,template_id,label) values('aa000000-0000-0000-0000-000000000021','aa000000-0000-0000-0000-000000000020','Clean kitchen');
insert into public.properties(id,owner_id,name,primary_checklist_template_id) values('aa000000-0000-0000-0000-000000000010','aa000000-0000-0000-0000-000000000001','Hostex integrity fixture','aa000000-0000-0000-0000-000000000020');
insert into public.cleaners(id,owner_id,user_id,full_name,role) values
 ('aa000000-0000-0000-0000-000000000030','aa000000-0000-0000-0000-000000000001',null,'Original cleaner','cleaner'),
 ('aa000000-0000-0000-0000-000000000031','aa000000-0000-0000-0000-000000000001',null,'New default','cleaner');
update public.properties set default_cleaner_id='aa000000-0000-0000-0000-000000000030' where id='aa000000-0000-0000-0000-000000000010';
do $$
declare payload jsonb; created_id uuid; result jsonb; moved_id uuid;
begin
 payload:=jsonb_build_object('owner_id','aa000000-0000-0000-0000-000000000001','property_id','aa000000-0000-0000-0000-000000000010','listing_property_id','aa000000-0000-0000-0000-000000000010',
 'checkout_at','2035-01-01T16:00Z','due_at','2035-01-01T20:00Z','hostex_reservation_code','R1','hostex_stay_code','S1','booking_channel','airbnb');
 result:=public.create_hostex_cleaning(payload); created_id:=(result->>'id')::uuid;
 if not (result->>'created')::boolean then raise exception 'FAIL first import not created'; end if;
 if (select count(*) from public.assignment_checklist_items where assignment_id=created_id)<>1 then raise exception 'FAIL checklist not atomic'; end if;
 if (public.create_hostex_cleaning(payload)->>'created')::boolean then raise exception 'FAIL retry duplicated job'; end if;
 if not public.apply_hostex_job_change(created_id,'aa000000-0000-0000-0000-000000000001','cancel','{}') then raise exception 'FAIL cancellation'; end if;
 update public.properties set default_cleaner_id='aa000000-0000-0000-0000-000000000031' where id='aa000000-0000-0000-0000-000000000010';
 result:=public.create_hostex_cleaning(payload);
 if (select cleaner_id from public.assignments where id=created_id)<>'aa000000-0000-0000-0000-000000000030' or (select ack_status from public.assignments where id=created_id)<>'accepted' then raise exception 'FAIL original cleaner/response lost'; end if;
 if (result->>'id')::uuid<>created_id or not (result->>'revived')::boolean then raise exception 'FAIL same-stay reacceptance'; end if;
 if (select count(*) from public.assignment_checklist_items where assignment_id=created_id)<>1 then raise exception 'FAIL checklist duplicated on reaccept'; end if;
 update public.assignments set status='in_progress',started_at=now() where id=created_id;
 -- Started history remains; new checkout is a distinct turnover reference.
 result:=public.create_hostex_cleaning(payload||jsonb_build_object('checkout_at','2035-01-03T16:00Z','due_at','2035-01-03T20:00Z'));
 moved_id:=(result->>'id')::uuid;
 if moved_id=created_id then raise exception 'FAIL overwrote started history'; end if;
 if public.apply_hostex_job_change(created_id,'aa000000-0000-0000-0000-000000000001','move',jsonb_build_object('checkout_at','2035-01-04T16:00Z','due_at','2035-01-04T20:00Z')) then raise exception 'FAIL started job moved'; end if;
 -- The snapshot must not mutate a different stay, even under one booking.
 if public.apply_hostex_job_change(moved_id,'aa000000-0000-0000-0000-000000000001','cancel',jsonb_build_object('expected_code','R1','expected_stay_code','DIFFERENT')) then raise exception 'FAIL stale stay cancelled'; end if;
 if public.flag_hostex_cleaning(moved_id,'aa000000-0000-0000-0000-000000000001','Stale flag','Stale stay',jsonb_build_object('expected_stay_code','DIFFERENT')) then raise exception 'FAIL stale stay flagged'; end if;
 insert into public.payout_batches(id,owner_id,label,period_start,period_end,status) values('aa000000-0000-0000-0000-000000000040','aa000000-0000-0000-0000-000000000001','Hostex protection','2035-01-01','2035-01-31','approved');
 insert into public.payout_entries(batch_id,owner_id,assignment_id,property_id,cleaner_id,amount) values('aa000000-0000-0000-0000-000000000040','aa000000-0000-0000-0000-000000000001',moved_id,'aa000000-0000-0000-0000-000000000010','aa000000-0000-0000-0000-000000000031',75);
 if public.apply_hostex_job_change(moved_id,'aa000000-0000-0000-0000-000000000001','cancel','{}') then raise exception 'FAIL report-linked job cancelled'; end if;
 if public.apply_hostex_job_change(moved_id,'aa000000-0000-0000-0000-000000000001','arrival',jsonb_build_object('next_checkin_at','2035-01-04T20:00Z')) then raise exception 'FAIL report-linked arrival changed'; end if;
 delete from public.payout_entries where assignment_id=moved_id;
 insert into public.cleaning_scope_corrections(id,assignment_id,owner_id,actor_id,reason,before_record,after_record)
 values('aa000000-0000-0000-0000-000000000050',moved_id,'aa000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','Adjustment fixture','{}','{}');
 insert into public.cleaning_pay_adjustments(correction_id,owner_id,assignment_id,cleaner_id,amount,entry_date,reason)
 values('aa000000-0000-0000-0000-000000000050','aa000000-0000-0000-0000-000000000001',moved_id,'aa000000-0000-0000-0000-000000000031',5,'2035-01-03','Scope fixture');
 if public.apply_hostex_job_change(moved_id,'aa000000-0000-0000-0000-000000000001','move',jsonb_build_object('checkout_at','2035-01-04T16:00Z','due_at','2035-01-04T20:00Z')) then raise exception 'FAIL scope-adjusted job moved'; end if;
 -- Failure to create the issue must roll the cancellation marker back.
 begin
  perform public.flag_hostex_cleaning(created_id,'aa000000-0000-0000-0000-000000000001',null,null);
  raise exception 'FAIL invalid issue unexpectedly inserted';
 exception when not_null_violation then null; end;
 if (select reservation_cancelled_at from public.assignments where id=created_id) is not null then raise exception 'FAIL orphan cancellation marker'; end if;
 perform public.flag_hostex_cleaning(created_id,'aa000000-0000-0000-0000-000000000001','Booking changed','Review booking R1');
 perform public.flag_hostex_cleaning(created_id,'aa000000-0000-0000-0000-000000000001','Booking changed','Review booking R1');
 if (select count(*) from public.issues where assignment_id=created_id)<>1 then raise exception 'FAIL flag issue duplicated'; end if;
 if has_function_privilege('authenticated','public.create_hostex_cleaning(jsonb)','execute') then raise exception 'FAIL tenant can call sync RPC'; end if;
 if has_function_privilege('anon','public.apply_hostex_job_change(uuid,uuid,text,jsonb)','execute') then raise exception 'FAIL anonymous sync mutation'; end if;
end $$;
create function pg_temp.reject_hostex_checklist() returns trigger language plpgsql as $$ begin raise exception 'fixture checklist unavailable'; end $$;
create trigger reject_hostex_checklist before insert on public.assignment_checklist_items for each row execute function pg_temp.reject_hostex_checklist();
do $$ declare payload jsonb; begin
 payload:=jsonb_build_object('owner_id','aa000000-0000-0000-0000-000000000001','property_id','aa000000-0000-0000-0000-000000000010','listing_property_id','aa000000-0000-0000-0000-000000000010','checkout_at','2035-02-01T16:00Z','due_at','2035-02-01T20:00Z','hostex_reservation_code','ROLLBACK','hostex_stay_code','ROLLBACK','booking_channel','airbnb');
 begin perform public.create_hostex_cleaning(payload); raise exception 'FAIL checklist failure was ignored';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 if exists(select 1 from public.assignments where hostex_stay_code='ROLLBACK') then raise exception 'FAIL job stranded without checklist'; end if;
end $$;
drop trigger reject_hostex_checklist on public.assignment_checklist_items;
do $$ declare result jsonb; begin
 result:=public.create_hostex_cleaning(jsonb_build_object('owner_id','aa000000-0000-0000-0000-000000000001','property_id','aa000000-0000-0000-0000-000000000010','listing_property_id','aa000000-0000-0000-0000-000000000010','checkout_at','2035-02-01T16:00Z','due_at','2035-02-01T20:00Z','hostex_reservation_code','ROLLBACK','hostex_stay_code','ROLLBACK','booking_channel','airbnb'));
 if not (result->>'created')::boolean then raise exception 'FAIL checklist creation retry'; end if;
end $$;
rollback;
select 'Hostex sync integrity tests passed';
