begin;
insert into auth.users(id,email) values
 ('f0000000-0000-0000-0000-000000000001','extra-owner@test'),
 ('f0000000-0000-0000-0000-000000000002','extra-cleaner@test'),
 ('f0000000-0000-0000-0000-000000000003','extra-other@test');
update public.users set role='owner',owner_id=id where id in ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000003');
update public.users set role='cleaner',owner_id='f0000000-0000-0000-0000-000000000001' where id='f0000000-0000-0000-0000-000000000002';
insert into public.properties(id,owner_id,name,timezone) values('f0000000-0000-0000-0000-000000000010','f0000000-0000-0000-0000-000000000001','Extra fixture','America/New_York');
insert into public.assignments(id,owner_id,property_id,cleaner_id,due_at,checkout_at,status,ack_status,fixed_payout_amount) values('f0000000-0000-0000-0000-000000000020','f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000010','f0000000-0000-0000-0000-000000000002','2030-01-01T20:00Z','2030-01-01T16:00Z','approved','accepted',95);

select set_config('request.jwt.claims','{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.record_cleaner_payment('f0000000-0000-0000-0000-000000000030','f0000000-0000-0000-0000-000000000002',1000,current_date-3,'zelle','ZELLE-ABC123');
select public.record_cleaner_payment('f0000000-0000-0000-0000-000000000030','f0000000-0000-0000-0000-000000000002',1000,current_date-3,'zelle','ZELLE-ABC123');
do $$ begin
 begin perform public.record_cleaner_payment(gen_random_uuid(),'f0000000-0000-0000-0000-000000000002',999,current_date,'zelle','zelle abc123'); raise exception 'FAIL duplicate reference with different amount/date'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; if sqlerrm not like 'Likely duplicate%' then raise; end if; end;
 begin perform public.record_cleaner_payment(gen_random_uuid(),'f0000000-0000-0000-0000-000000000002',1000,current_date-2,'zelle','Confirmation ZELLE-ABC123'); raise exception 'FAIL similar reference'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; if sqlerrm not like 'Likely duplicate%' then raise; end if; end;
 if (select verified from public.cleaner_payments where id='f0000000-0000-0000-0000-000000000030') then raise exception 'FAIL unconfirmed payment verified'; end if;
end $$;
select public.verify_cleaner_payment('f0000000-0000-0000-0000-000000000030');
select public.verify_cleaner_payment('f0000000-0000-0000-0000-000000000030');
do $$ begin
 if not exists(select 1 from public.cleaner_payments where verified and verified_by=auth.uid() and verified_at is not null) then raise exception 'FAIL verification missing'; end if;
end $$;
select public.record_cleaner_payment(gen_random_uuid(),'f0000000-0000-0000-0000-000000000002',1000,current_date,'cash');
select public.record_cleaner_payment(gen_random_uuid(),'f0000000-0000-0000-0000-000000000002',1000,current_date,'cash');
reset role;
do $$ begin
 begin
 insert into public.assignments(owner_id,property_id,cleaner_id,due_at,checkout_at,status,ack_status,fixed_payout_amount,cleaned_on,cleaned_on_source)
 values('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000010','f0000000-0000-0000-0000-000000000002','2030-01-01T20:00Z','2030-01-01T16:00Z','approved','accepted',95,'2026-10-19','owner_correction');
 raise exception 'FAIL inserted unproven actual date';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if; if sqlerrm not like 'Actual cleaning dates require%' then raise; end if; end;
end $$;
update public.assignments set completed_at='2026-10-20T02:00Z' where id='f0000000-0000-0000-0000-000000000020';
do $$ begin
 if (select cleaned_on from public.assignments where id='f0000000-0000-0000-0000-000000000020')<>'2026-10-19'::date then raise exception 'FAIL completion timezone'; end if;
end $$;
set local role authenticated;
select public.correct_cleaning_date('f0000000-0000-0000-0000-000000000020','2026-10-18','Confirmed owner date','f0000000-0000-0000-0000-000000000050');
select public.correct_cleaning_date('f0000000-0000-0000-0000-000000000020','2026-10-18','Confirmed owner date','f0000000-0000-0000-0000-000000000050');
do $$ begin
 if (select cleaned_on from public.assignments where id='f0000000-0000-0000-0000-000000000020')<>'2026-10-18'::date then raise exception 'FAIL corrected date'; end if;
 if (select cleaned_on_source from public.assignments where id='f0000000-0000-0000-0000-000000000020')<>'owner_correction' then raise exception 'FAIL source missing'; end if;
 begin update public.assignments set cleaned_on_source='completion_confirmation' where id='f0000000-0000-0000-0000-000000000020'; raise exception 'FAIL source-only edit bypass'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 if (select completed_at from public.assignments where id='f0000000-0000-0000-0000-000000000020')<>'2026-10-20T02:00Z'::timestamptz then raise exception 'FAIL completion evidence changed'; end if;
 begin update public.assignments set cleaned_on='2026-10-17' where id='f0000000-0000-0000-0000-000000000020'; raise exception 'FAIL bypassed correction reason'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin perform public.correct_cleaning_date('f0000000-0000-0000-0000-000000000020','2026-10-17','Confirmed owner date','f0000000-0000-0000-0000-000000000050'); raise exception 'FAIL conflicting retry'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 begin perform public.verify_cleaner_payment('f0000000-0000-0000-0000-000000000030'); raise exception 'FAIL outsider verified'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin perform public.correct_cleaning_date('f0000000-0000-0000-0000-000000000020','2026-10-18','Confirmed owner date','f0000000-0000-0000-0000-000000000050'); raise exception 'FAIL outsider replay'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
rollback;
select 'Completion and payment integrity tests passed';
