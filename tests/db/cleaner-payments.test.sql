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
select public.record_cleaner_payment('f0000000-0000-0000-0000-000000000030','f0000000-0000-0000-0000-000000000002',25,current_date,'cash');
select public.record_cleaner_payment('f0000000-0000-0000-0000-000000000030','f0000000-0000-0000-0000-000000000002',25,current_date,'cash');
do $$ begin
 if (select count(*) from public.cleaner_payments)<>1 then raise exception 'FAIL duplicate payment'; end if;
 begin perform public.record_cleaner_payment(gen_random_uuid(),'f0000000-0000-0000-0000-000000000002',-1,current_date,'cash'); raise exception 'FAIL negative accepted'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin perform public.record_cleaner_payment(gen_random_uuid(),'f0000000-0000-0000-0000-000000000002',1,current_date+1,'cash'); raise exception 'FAIL future accepted'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select public.set_cleaning_jobs_paid(array['f0000000-0000-0000-0000-000000000020'::uuid],true,'cash');
select public.set_cleaning_jobs_paid(array['f0000000-0000-0000-0000-000000000020'::uuid],true,'cash');
do $$ begin
 if (select sum(amount) from public.cleaner_payments where voided_at is null)<>120 then raise exception 'FAIL job total/retry'; end if;
end $$;
-- Missing job stamps are repaired from canonical proof, without another row.
update public.assignments set paid_at=null where id='f0000000-0000-0000-0000-000000000020';
select public.set_cleaning_jobs_paid(array['f0000000-0000-0000-0000-000000000020'::uuid],true,'cash');
do $$ begin
 if (select paid_at from public.assignments where id='f0000000-0000-0000-0000-000000000020') is null then raise exception 'FAIL missing canonical proof repair'; end if;
 if (select count(*) from public.cleaner_payments where assignment_id is not null)<>1 then raise exception 'FAIL canonical proof repair duplicated'; end if;
end $$;
select public.set_cleaning_jobs_paid(array['f0000000-0000-0000-0000-000000000020'::uuid],false);
select public.set_cleaning_jobs_paid(array['f0000000-0000-0000-0000-000000000020'::uuid],true,'venmo');
do $$ begin
 if (select count(*) from public.cleaner_payments where assignment_id is not null)<>2 then raise exception 'FAIL lost void history'; end if;
 if (select sum(amount) from public.cleaner_payments where voided_at is null)<>120 then raise exception 'FAIL undo repay'; end if;
end $$;
select public.void_cleaner_payment('f0000000-0000-0000-0000-000000000030','Mistaken duplicate transfer');
reset role;
insert into public.payout_batches(id,owner_id,label,period_start,period_end,status) values('f0000000-0000-0000-0000-000000000040','f0000000-0000-0000-0000-000000000001','Payment fixture','2030-01-01','2030-01-31','approved');
insert into public.payout_entries(id,batch_id,owner_id,assignment_id,property_id,cleaner_id,amount) values('f0000000-0000-0000-0000-000000000041','f0000000-0000-0000-0000-000000000040','f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000020','f0000000-0000-0000-0000-000000000010','f0000000-0000-0000-0000-000000000002',95);
set local role authenticated;
select public.pay_payout_batch('f0000000-0000-0000-0000-000000000040');
do $$ begin
 if (select sum(amount) from public.cleaner_payments where voided_at is null)<>95 then raise exception 'FAIL job/report doubled payment'; end if;
 begin update public.payout_entries set amount=1 where id='f0000000-0000-0000-0000-000000000041'; raise exception 'FAIL changed report snapshot'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin update public.payout_entries set status='excluded' where id='f0000000-0000-0000-0000-000000000041'; raise exception 'FAIL excluded paid history'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;

 begin perform public.set_cleaning_jobs_paid(array['f0000000-0000-0000-0000-000000000020'::uuid],false); raise exception 'FAIL changed paid report'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.cleaner_payments)<>3 then raise exception 'FAIL own payment visibility'; end if;
 begin perform public.record_cleaner_payment(gen_random_uuid(),'f0000000-0000-0000-0000-000000000002',1,current_date,'cash'); raise exception 'FAIL cleaner wrote payment'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin update public.cleaner_payments set amount=1; raise exception 'FAIL direct write'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin update public.assignments set paid_at=null where id='f0000000-0000-0000-0000-000000000020'; raise exception 'FAIL cleaner cleared proof'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin update public.assignments set payment_method='cash',payment_reference='forged',marked_paid_by_user_id=auth.uid() where id='f0000000-0000-0000-0000-000000000020'; raise exception 'FAIL cleaner forged proof'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;

end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.cleaner_payments) then raise exception 'FAIL cross tenant read'; end if;
 begin perform public.record_cleaner_payment(gen_random_uuid(),'f0000000-0000-0000-0000-000000000002',1,current_date,'cash'); raise exception 'FAIL cross tenant wrote'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
-- An old entry payment must survive the job/report transition.
insert into public.assignments(id,owner_id,property_id,cleaner_id,due_at,checkout_at,status,ack_status,fixed_payout_amount)
values('f0000000-0000-0000-0000-000000000021','f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000010','f0000000-0000-0000-0000-000000000002','2030-01-02T20:00Z','2030-01-02T16:00Z','approved','accepted',80);
insert into public.payout_batches(id,owner_id,label,period_start,period_end,status) values('f0000000-0000-0000-0000-000000000042','f0000000-0000-0000-0000-000000000001','Legacy partial payment','2030-01-01','2030-01-31','approved');
insert into public.payout_entries(batch_id,owner_id,assignment_id,property_id,cleaner_id,amount,paid_at) values('f0000000-0000-0000-0000-000000000042','f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000021','f0000000-0000-0000-0000-000000000010','f0000000-0000-0000-0000-000000000002',80,'2026-01-01T12:00Z');
select set_config('request.jwt.claims','{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.set_cleaning_jobs_paid(array['f0000000-0000-0000-0000-000000000021'::uuid],true,'cash');
do $$ begin
 if (select paid_at from public.assignments where id='f0000000-0000-0000-0000-000000000021') is distinct from '2026-01-01T12:00Z'::timestamptz then raise exception 'FAIL lost original legacy proof date'; end if;
 if exists(select 1 from public.cleaner_payments where assignment_id='f0000000-0000-0000-0000-000000000021') then raise exception 'FAIL new payment for legacy proof'; end if;
 begin update public.payout_batches set status='cancelled' where id='f0000000-0000-0000-0000-000000000042'; raise exception 'FAIL cancelled partial paid report'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
insert into public.cleaner_accounts(cleaner_id,owner_id,label,reconciled_through,source_note)
values('f0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000001','Fixture',current_date,'Imported history');
select set_config('request.jwt.claims','{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 begin perform public.record_cleaner_payment(gen_random_uuid(),'f0000000-0000-0000-0000-000000000002',10,current_date,'cash'); raise exception 'FAIL duplicated reconciled payment'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin perform public.record_cleaner_payment('f0000000-0000-0000-0000-000000000030','f0000000-0000-0000-0000-000000000002',25,current_date,'cash'); raise exception 'FAIL revived voided retry'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
rollback;
select 'Cleaner payment tests passed';
