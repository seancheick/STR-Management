begin;
insert into auth.users(id,email) values
 ('e0000000-0000-0000-0000-000000000001','extra-owner@test'),
 ('e0000000-0000-0000-0000-000000000002','extra-cleaner@test'),
 ('e0000000-0000-0000-0000-000000000003','extra-other@test');
update public.users set role='owner',owner_id=id where id in ('e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000003');
update public.users set role='cleaner',owner_id='e0000000-0000-0000-0000-000000000001' where id='e0000000-0000-0000-0000-000000000002';
insert into public.properties(id,owner_id,name,timezone) values('e0000000-0000-0000-0000-000000000010','e0000000-0000-0000-0000-000000000001','Extra fixture','America/New_York');
insert into public.assignments(id,owner_id,property_id,cleaner_id,due_at,checkout_at,status,ack_status,fixed_payout_amount) values('e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000010','e0000000-0000-0000-0000-000000000002','2030-01-01T20:00Z','2030-01-01T16:00Z','confirmed','accepted',75);
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.add_assignment_extra('e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000030','Trash removal',10,'service');
select public.add_assignment_extra('e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000030','Trash removal',10,'service');
select public.add_assignment_extra('e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000031','Supplies receipt',10,'reimbursement');
do $$ begin
 if (select fixed_payout_amount from public.assignments where id='e0000000-0000-0000-0000-000000000020')<>95 then raise exception 'FAIL extras total or retry duplicate'; end if;
 if (select count(*) from public.assignment_extras where assignment_id='e0000000-0000-0000-0000-000000000020')<>2 then raise exception 'FAIL extra line count'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.assignment_extras where assignment_id='e0000000-0000-0000-0000-000000000020')<>2 then raise exception 'FAIL cleaner cannot read itemization'; end if;
 begin perform public.add_assignment_extra('e0000000-0000-0000-0000-000000000020',gen_random_uuid(),'Unauthorized',1,'service'); raise exception 'FAIL cleaner changed extras'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin update public.assignments set fixed_payout_amount=500 where id='e0000000-0000-0000-0000-000000000020'; raise exception 'FAIL cleaner changed pay'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.assignment_extras where assignment_id='e0000000-0000-0000-0000-000000000020') then raise exception 'FAIL cross tenant read'; end if;
 begin perform public.remove_assignment_extra('e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000030'); raise exception 'FAIL cross tenant mutation'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.remove_assignment_extra('e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000030');
do $$ begin
 if (select fixed_payout_amount from public.assignments where id='e0000000-0000-0000-0000-000000000020')<>85 then raise exception 'FAIL removing extra changed base fee'; end if;
end $$;
-- A delayed retry after removal must never resurrect a charge.
select public.add_assignment_extra('e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000030','Trash removal',10,'service');
do $$ begin
 if exists(select 1 from public.assignment_extras where id='e0000000-0000-0000-0000-000000000030') then raise exception 'FAIL removed extra resurrected'; end if;
 begin perform public.add_assignment_extra('e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000030','Different',10,'service'); raise exception 'FAIL conflicting receipt accepted'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- A stale timing form must not overwrite a newly added extra.
select public.owner_manage_cleaning('e0000000-0000-0000-0000-000000000020','edit',null,
 '{"due_at":"2030-01-01T20:00Z","checkout_at":"2030-01-01T16:00Z","cleaner_id":"e0000000-0000-0000-0000-000000000002","priority":"normal","expected_duration_min":120,"fixed_payout_amount":75,"original_fixed_payout_amount":75}');
do $$ begin
 if (select fixed_payout_amount from public.assignments where id='e0000000-0000-0000-0000-000000000020')<>85 then raise exception 'FAIL stale edit overwrote extras'; end if;
end $$;
insert into public.assignments(id,owner_id,property_id,due_at,checkout_at) values('e0000000-0000-0000-0000-000000000021','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000010','2030-01-02T20:00Z','2030-01-02T16:00Z');
select public.owner_manage_cleaning('e0000000-0000-0000-0000-000000000021','edit',null,
 '{"due_at":"2030-01-02T20:00Z","checkout_at":"2030-01-02T16:00Z","cleaner_id":"e0000000-0000-0000-0000-000000000002","priority":"normal","expected_duration_min":120,"fixed_payout_amount":75,"original_fixed_payout_amount":null}');
do $$ begin
 if (select fixed_payout_amount from public.assignments where id='e0000000-0000-0000-0000-000000000021')<>75 then raise exception 'FAIL first pay on unassigned job'; end if;
end $$;
insert into public.payout_batches(id,owner_id,label,period_start,period_end) values('e0000000-0000-0000-0000-000000000040','e0000000-0000-0000-0000-000000000001','Fixture report','2030-01-01','2030-01-31');
insert into public.payout_entries(batch_id,owner_id,assignment_id,property_id,cleaner_id,amount) values('e0000000-0000-0000-0000-000000000040','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000021','e0000000-0000-0000-0000-000000000010','e0000000-0000-0000-0000-000000000002',75);
do $$ begin
 begin perform public.add_assignment_extra('e0000000-0000-0000-0000-000000000021',gen_random_uuid(),'Report extra',5,'service'); raise exception 'FAIL modified reported pay'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin perform public.owner_manage_cleaning('e0000000-0000-0000-0000-000000000021','edit',null,
 '{"due_at":"2030-02-02T20:00Z","checkout_at":"2030-02-02T16:00Z","cleaner_id":"e0000000-0000-0000-0000-000000000002","priority":"normal","expected_duration_min":120,"fixed_payout_amount":75,"original_fixed_payout_amount":75}'); raise exception 'FAIL moved reported job date'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- A corrected scope must never have its canonical total bypassed by extras.
select public.correct_cleaning_scope(gen_random_uuid(),'e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000010',85,'Regression scope correction');
do $$ begin
 begin perform public.add_assignment_extra('e0000000-0000-0000-0000-000000000020',gen_random_uuid(),'Scope bypass',5,'service'); raise exception 'FAIL extras bypassed corrected scope'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin perform public.remove_assignment_extra('e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000031'); raise exception 'FAIL removal bypassed corrected scope'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
update public.assignments set paid_at=now() where id='e0000000-0000-0000-0000-000000000020';
select public.add_assignment_extra('e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000031','Supplies receipt',10,'reimbursement');
select public.remove_assignment_extra('e0000000-0000-0000-0000-000000000020','e0000000-0000-0000-0000-000000000030');
do $$ begin
 begin perform public.add_assignment_extra('e0000000-0000-0000-0000-000000000020',gen_random_uuid(),'After payment',10,'service'); raise exception 'FAIL modified paid job'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
rollback;
select 'Assignment extras tests passed';
