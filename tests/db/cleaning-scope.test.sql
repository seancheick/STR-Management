begin;
insert into auth.users(id,email) values
 ('c0000000-0000-0000-0000-000000000001','extra-owner@test'),
 ('c0000000-0000-0000-0000-000000000002','extra-cleaner@test'),
 ('c0000000-0000-0000-0000-000000000003','extra-other@test');
update public.users set role='owner',owner_id=id where id in ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003');
update public.users set role='cleaner',owner_id='c0000000-0000-0000-0000-000000000001' where id='c0000000-0000-0000-0000-000000000002';
insert into public.properties(id,owner_id,name,timezone) values('c0000000-0000-0000-0000-000000000010','c0000000-0000-0000-0000-000000000001','Extra fixture','America/New_York');
insert into public.cleaners(id,owner_id,user_id,full_name,role) values('c0000000-0000-0000-0000-000000000099','c0000000-0000-0000-0000-000000000001',null,'Independent','cleaner');
insert into public.assignments(id,owner_id,property_id,cleaner_id,due_at,checkout_at,status,ack_status,fixed_payout_amount) values('c0000000-0000-0000-0000-000000000020','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000010','c0000000-0000-0000-0000-000000000099','2030-01-01T20:00Z','2030-01-01T16:00Z','confirmed','accepted',75);
select set_config('request.jwt.claims','{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
reset role;
insert into public.properties(id,owner_id,name,timezone,physical_unit_id) values('c0000000-0000-0000-0000-000000000011','c0000000-0000-0000-0000-000000000001','Three bedrooms','America/New_York','c0000000-0000-0000-0000-000000000010');
update public.assignments set status='approved',approved_at=now() where id='c0000000-0000-0000-0000-000000000020';
insert into public.assignment_checklist_items(assignment_id,label,completed,completed_at) values('c0000000-0000-0000-0000-000000000020','Existing evidence',true,now());
insert into public.assignment_photos(assignment_id,photo_category,storage_path,file_size_bytes) values('c0000000-0000-0000-0000-000000000020','bedroom','scope-test/evidence.jpg',100);
insert into public.checklist_templates(id,owner_id,name) values('c0000000-0000-0000-0000-000000000070','c0000000-0000-0000-0000-000000000001','Three rooms');
insert into public.checklist_template_items(template_id,label) values('c0000000-0000-0000-0000-000000000070','Third bedroom');
update public.properties set primary_checklist_template_id='c0000000-0000-0000-0000-000000000070' where id='c0000000-0000-0000-0000-000000000011';
set local role authenticated;
select public.correct_cleaning_scope('c0000000-0000-0000-0000-000000000030','c0000000-0000-0000-0000-000000000020','c0000000-0000-0000-0000-000000000011',120,'Three bedrooms used',75);
select public.correct_cleaning_scope('c0000000-0000-0000-0000-000000000030','c0000000-0000-0000-0000-000000000020','c0000000-0000-0000-0000-000000000011',120,'Three bedrooms used',75);
do $$ begin
 if (select fixed_payout_amount from public.assignments where id='c0000000-0000-0000-0000-000000000020')<>120 then raise exception 'FAIL approved scope total'; end if;
 if (select status from public.assignments where id='c0000000-0000-0000-0000-000000000020')<>'approved' then raise exception 'FAIL completion changed'; end if;
 begin update public.assignments set fixed_payout_amount=75 where id='c0000000-0000-0000-0000-000000000020'; raise exception 'FAIL generic overwrite'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin perform public.correct_cleaning_scope(gen_random_uuid(),'c0000000-0000-0000-0000-000000000020','c0000000-0000-0000-0000-000000000011',130,'Stale',75); raise exception 'FAIL stale accepted'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
do $$ begin
 if not exists(select 1 from public.assignment_checklist_items where assignment_id='c0000000-0000-0000-0000-000000000020' and label='Existing evidence' and completed) or not exists(select 1 from public.assignment_photos where storage_path='scope-test/evidence.jpg') then raise exception 'FAIL erased historical evidence'; end if;
end $$;
reset role;
update public.assignments set paid_at=now() where id='c0000000-0000-0000-0000-000000000020';
set local role authenticated;
select public.correct_cleaning_scope('c0000000-0000-0000-0000-000000000031','c0000000-0000-0000-0000-000000000020','c0000000-0000-0000-0000-000000000011',150,'Additional scope',120);
do $$ begin
 if (select fixed_payout_amount from public.assignments where id='c0000000-0000-0000-0000-000000000020')<>120 then raise exception 'FAIL paid history overwritten'; end if;
 if (select sum(amount) from public.cleaning_pay_adjustments)<>30 then raise exception 'FAIL missing adjustment'; end if;
end $$;
reset role;
update public.assignments set paid_at=null where id='c0000000-0000-0000-0000-000000000020';
set local role authenticated;
select public.correct_cleaning_scope('c0000000-0000-0000-0000-000000000032','c0000000-0000-0000-0000-000000000020','c0000000-0000-0000-0000-000000000011',110,'Reduced scope',150);
do $$ begin
 if (select fixed_payout_amount from public.assignments where id='c0000000-0000-0000-0000-000000000020')<>120 then raise exception 'FAIL unlocking adjustment rewrote base'; end if;
 if (select sum(amount) from public.cleaning_pay_adjustments)<>-10 then raise exception 'FAIL negative adjustment'; end if;
end $$;
do $$ begin
 begin perform public.correct_cleaning_scope(gen_random_uuid(),'c0000000-0000-0000-0000-000000000020','c0000000-0000-0000-0000-000000000011',110,'Stale scope',110,'c0000000-0000-0000-0000-000000000010'); raise exception 'FAIL stale scope accepted'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
update public.properties set active=false where id='c0000000-0000-0000-0000-000000000011';
insert into public.properties(id,owner_id,name,timezone) values('c0000000-0000-0000-0000-000000000012','c0000000-0000-0000-0000-000000000001','Other unit','America/New_York'),('c0000000-0000-0000-0000-000000000013','c0000000-0000-0000-0000-000000000003','Other tenant','America/New_York');
set local role authenticated;
do $$ declare target uuid; begin
 foreach target in array array['c0000000-0000-0000-0000-000000000011'::uuid,'c0000000-0000-0000-0000-000000000012'::uuid,'c0000000-0000-0000-0000-000000000013'::uuid] loop
 begin perform public.correct_cleaning_scope(gen_random_uuid(),'c0000000-0000-0000-0000-000000000020',target,120,'Invalid scope'); raise exception 'FAIL invalid scope'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 end loop;
end $$;
reset role;
update public.cleaners set user_id=null where id='c0000000-0000-0000-0000-000000000002';
update public.cleaners set user_id='c0000000-0000-0000-0000-000000000002' where id='c0000000-0000-0000-0000-000000000099';
select set_config('request.jwt.claims','{"sub":"c0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 begin perform public.correct_cleaning_scope(gen_random_uuid(),'c0000000-0000-0000-0000-000000000020','c0000000-0000-0000-0000-000000000011',160,'Unauthorized'); raise exception 'FAIL cleaner mutation'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
do $$ begin
 if (select count(*) from public.cleaning_scope_corrections)<>3 then raise exception 'FAIL independent cleaner scope visibility'; end if;
 if (select count(*) from public.cleaning_pay_adjustments)<>2 then raise exception 'FAIL independent cleaner adjustment visibility'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.cleaning_scope_corrections) or exists(select 1 from public.cleaning_pay_adjustments) then raise exception 'FAIL cross tenant correction visibility'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set active=true where id='c0000000-0000-0000-0000-000000000011';
insert into public.assignments(id,owner_id,property_id,due_at,status,fixed_payout_amount) values('c0000000-0000-0000-0000-000000000021','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000010','2030-01-02T20:00Z','unassigned',90);
insert into public.assignment_checklist_items(assignment_id,label) values('c0000000-0000-0000-0000-000000000021','Old untouched');
set local role authenticated;
select public.correct_cleaning_scope('c0000000-0000-0000-0000-000000000033','c0000000-0000-0000-0000-000000000021','c0000000-0000-0000-0000-000000000011',120,'Three rooms required');
do $$ begin
 if exists(select 1 from public.assignment_checklist_items where assignment_id='c0000000-0000-0000-0000-000000000021' and label='Old untouched') or not exists(select 1 from public.assignment_checklist_items where assignment_id='c0000000-0000-0000-0000-000000000021' and label='Third bedroom' and not completed) then raise exception 'FAIL untouched checklist refresh'; end if;
end $$;
reset role;
-- Calendar metadata may refresh, while its default-pay update skips scope overrides.
update public.assignments set source_reference='refreshed-source' where id='c0000000-0000-0000-0000-000000000021';
update public.assignments set fixed_payout_amount=90,listing_property_id=property_id where id='c0000000-0000-0000-0000-000000000021' and cleaning_scope_property_id is null;
do $$ begin
 if not exists(select 1 from public.assignments where id='c0000000-0000-0000-0000-000000000021' and source_reference='refreshed-source' and cleaning_scope_property_id='c0000000-0000-0000-0000-000000000011' and fixed_payout_amount=120 and listing_property_id is null) then raise exception 'FAIL sync overwrote correction'; end if;
end $$;
reset role;
insert into public.cleaner_accounts(cleaner_id,owner_id,label,reconciled_through,source_note) values('c0000000-0000-0000-0000-000000000099','c0000000-0000-0000-0000-000000000001','Reconciled fixture','2030-01-05','Test opening history');
insert into public.assignments(id,owner_id,property_id,cleaner_id,due_at,status,fixed_payout_amount) values('c0000000-0000-0000-0000-000000000022','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000010','c0000000-0000-0000-0000-000000000099','2030-01-03T20:00Z','approved',90);
set local role authenticated;
do $$ begin
 if not public.cleaning_scope_financial_locked('c0000000-0000-0000-0000-000000000022') then raise exception 'FAIL cutoff-only preview unlocked'; end if;
end $$;
select public.correct_cleaning_scope('c0000000-0000-0000-0000-000000000034','c0000000-0000-0000-0000-000000000022','c0000000-0000-0000-0000-000000000011',120,'Reconciled scope correction');
do $$ begin
 if (select fixed_payout_amount from public.assignments where id='c0000000-0000-0000-0000-000000000022')<>90 then raise exception 'FAIL cutoff-only base changed'; end if;
 if (select amount from public.cleaning_pay_adjustments where assignment_id='c0000000-0000-0000-0000-000000000022')<>30 then raise exception 'FAIL cutoff-only adjustment missing'; end if;
end $$;
select 'Cleaning scope correction tests passed';
rollback;
