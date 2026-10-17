begin;
insert into auth.users(id,email) values
('e1000000-0000-0000-0000-000000000001','contractor-owner@test'),
('e1000000-0000-0000-0000-000000000002','contractor-login@test'),
('e2000000-0000-0000-0000-000000000001','contractor-other-owner@test');
update public.users set role='owner',owner_id=id where id in ('e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001');
update public.users set role='cleaner',owner_id='e1000000-0000-0000-0000-000000000001' where id='e1000000-0000-0000-0000-000000000002';
insert into public.properties(id,owner_id,name) values('e1000000-0000-0000-0000-000000000010','e1000000-0000-0000-0000-000000000001','Contractor property');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.save_contractor('e1000000-0000-0000-0000-000000000100','Marketplace Alex',null,'401-555-0100','One-time deep clean',true);
do $$ begin
 if not exists(select 1 from public.cleaners where id='e1000000-0000-0000-0000-000000000100' and user_id is null and email is null and details='One-time deep clean') then raise exception 'FAIL offline contractor missing'; end if;
 if exists(select 1 from public.users where id='e1000000-0000-0000-0000-000000000100') then raise exception 'FAIL fabricated account'; end if;
end $$;
insert into public.assignments(id,owner_id,property_id,due_at,checkout_at,fixed_payout_amount) values
('e1000000-0000-0000-0000-000000000020','e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000010',now()-interval '1 day',now()-interval '1 day',90),
('e1000000-0000-0000-0000-000000000021','e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000010',now()+interval '1 day',now()+interval '1 day',90);
do $$ begin
 begin perform public.owner_manage_cleaning('e1000000-0000-0000-0000-000000000020','request','e1000000-0000-0000-0000-000000000100');raise exception 'FAIL offline request';exception when others then if sqlerrm like 'FAIL%' then raise; end if;end;
end $$;
select public.owner_manage_cleaning('e1000000-0000-0000-0000-000000000020','direct','e1000000-0000-0000-0000-000000000100');
select public.add_assignment_extra('e1000000-0000-0000-0000-000000000020','e1000000-0000-0000-0000-000000000030','Trash removal',10,'service');
select public.owner_manage_cleaning('e1000000-0000-0000-0000-000000000020','complete','e1000000-0000-0000-0000-000000000100','{}','Confirmed completed by phone',true);
reset role;
insert into public.cleaner_accounts(cleaner_id,owner_id,label,reconciled_through,source_note) values('e1000000-0000-0000-0000-000000000100','e1000000-0000-0000-0000-000000000001','Marketplace Alex','2020-01-01','Earlier work');
insert into public.cleaner_ledger_entries(id,cleaner_id,owner_id,entry_date,sequence,kind,description,amount,source_key) values('e1000000-0000-0000-0000-000000000031','e1000000-0000-0000-0000-000000000100','e1000000-0000-0000-0000-000000000001','2020-01-01',1,'cleaning','Earlier work',50,'contractor-test-history');
set local role authenticated;
select public.record_cleaner_payment('e1000000-0000-0000-0000-000000000032','e1000000-0000-0000-0000-000000000100',30,(now() at time zone 'America/New_York')::date,'cash');
insert into public.payout_batches(id,owner_id,label,period_start,period_end,status,cleaner_filter) values('e1000000-0000-0000-0000-000000000040','e1000000-0000-0000-0000-000000000001','Alex work',current_date-10,current_date,'draft','e1000000-0000-0000-0000-000000000100');
insert into public.payout_entries(id,batch_id,owner_id,assignment_id,cleaner_id,property_id,amount) values('e1000000-0000-0000-0000-000000000041','e1000000-0000-0000-0000-000000000040','e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000020','e1000000-0000-0000-0000-000000000100','e1000000-0000-0000-0000-000000000010',100);
update public.payout_batches set status='approved' where id='e1000000-0000-0000-0000-000000000040';
select public.manage_cleaner_state('e1000000-0000-0000-0000-000000000100',null,true);
select public.link_contractor_access('e1000000-0000-0000-0000-000000000100','e1000000-0000-0000-0000-000000000002');
select public.link_contractor_access('e1000000-0000-0000-0000-000000000100','e1000000-0000-0000-0000-000000000002');
select public.owner_manage_cleaning('e1000000-0000-0000-0000-000000000021','request','e1000000-0000-0000-0000-000000000100');
do $$ begin
 if not exists(select 1 from public.cleaners where id='e1000000-0000-0000-0000-000000000100' and phone='401-555-0100' and is_1099_contractor) then raise exception 'FAIL lost contact/tax details'; end if;
 if not exists(select 1 from public.notifications where assignment_id='e1000000-0000-0000-0000-000000000021' and recipient_id='e1000000-0000-0000-0000-000000000002') then raise exception 'FAIL notification target is not auth identity'; end if;
 if not exists(select 1 from public.assignments where id='e1000000-0000-0000-0000-000000000020' and cleaner_id='e1000000-0000-0000-0000-000000000100' and fixed_payout_amount=100 and status='approved' and paid_at is null) then raise exception 'FAIL history changed on link'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if app_private.current_cleaner_id()<>'e1000000-0000-0000-0000-000000000100' then raise exception 'FAIL linked cleaner identity'; end if;
 if (select count(*) from public.assignments where cleaner_id='e1000000-0000-0000-0000-000000000100')<>2 then raise exception 'FAIL linked job access'; end if;
 if not exists(select 1 from public.assignment_extras where assignment_id='e1000000-0000-0000-0000-000000000020') then raise exception 'FAIL linked extras access'; end if;
 if not exists(select 1 from public.cleaner_accounts where cleaner_id='e1000000-0000-0000-0000-000000000100') or not exists(select 1 from public.cleaner_ledger_entries where cleaner_id='e1000000-0000-0000-0000-000000000100') or not exists(select 1 from public.cleaner_payments where cleaner_id='e1000000-0000-0000-0000-000000000100') or not exists(select 1 from public.payout_entries where cleaner_id='e1000000-0000-0000-0000-000000000100') then raise exception 'FAIL linked financial history accounts %, ledger %, payments %, entries %',(select count(*) from public.cleaner_accounts where cleaner_id='e1000000-0000-0000-0000-000000000100'),(select count(*) from public.cleaner_ledger_entries where cleaner_id='e1000000-0000-0000-0000-000000000100'),(select count(*) from public.cleaner_payments where cleaner_id='e1000000-0000-0000-0000-000000000100'),(select count(*) from public.payout_entries where cleaner_id='e1000000-0000-0000-0000-000000000100'); end if;
 if not public.can_access_property('e1000000-0000-0000-0000-000000000010') then raise exception 'FAIL linked property access'; end if;
 begin perform public.save_contractor('e1000000-0000-0000-0000-000000000101','Self',null,null,'',true);raise exception 'FAIL cleaner creates contractor';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.link_contractor_access('e1000000-0000-0000-0000-000000000100','e1000000-0000-0000-0000-000000000002');raise exception 'FAIL self link';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
end $$;
select public.decline_cleaning_job('e1000000-0000-0000-0000-000000000021','conflict');
reset role;
set local role service_role;
do $$ begin
 begin perform public.discard_unused_invited_cleaner('e1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001');raise exception 'FAIL linked login cleanup permitted';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.cleaners where id='e1000000-0000-0000-0000-000000000100') then raise exception 'FAIL cross tenant read'; end if;
 begin perform public.save_contractor('e1000000-0000-0000-0000-000000000100','Hijack',null,null,'',true);raise exception 'FAIL cross tenant write';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.link_contractor_access('e1000000-0000-0000-0000-000000000100','e1000000-0000-0000-0000-000000000002');raise exception 'FAIL cross tenant link';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
end $$;
reset role;
rollback;
select 'Contractor identity tests passed';
