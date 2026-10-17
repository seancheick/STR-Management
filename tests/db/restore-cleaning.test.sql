begin;
insert into auth.users(id,email) values ('e3000000-0000-0000-0000-000000000001','restore-owner@test'),('e3000000-0000-0000-0000-000000000002','restore-cleaner@test');
update public.users set role='owner',owner_id=id where id='e3000000-0000-0000-0000-000000000001';
update public.users set role='cleaner',owner_id='e3000000-0000-0000-0000-000000000001' where id='e3000000-0000-0000-0000-000000000002';
insert into public.properties(id,owner_id,name) values('e3000000-0000-0000-0000-000000000010','e3000000-0000-0000-0000-000000000001','Restore basement');
insert into public.assignments(id,owner_id,property_id,status,cleaner_id,due_at,checkout_at,fixed_payout_amount) values('e3000000-0000-0000-0000-000000000020','e3000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000010','cancelled','e3000000-0000-0000-0000-000000000002','2026-10-15T19:00:00Z','2026-10-15T15:00:00Z',186);
select set_config('request.jwt.claims','{"sub":"e3000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$begin begin perform public.restore_cancelled_cleaning('e3000000-0000-0000-0000-000000000020');raise exception 'FAIL cleaner restored';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;end$$;
select set_config('request.jwt.claims','{"sub":"e3000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.restore_cancelled_cleaning('e3000000-0000-0000-0000-000000000020');
do $$begin
 if not exists(select 1 from public.assignments where id='e3000000-0000-0000-0000-000000000020' and status='unassigned' and cleaner_id is null and fixed_payout_amount=186 and checkout_at='2026-10-15T15:00:00Z') then raise exception 'FAIL original details lost';end if;
 begin perform public.restore_cancelled_cleaning('e3000000-0000-0000-0000-000000000020');raise exception 'FAIL repeated restore';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
end$$;
insert into public.assignments(id,owner_id,property_id,status,due_at,checkout_at) values('e3000000-0000-0000-0000-000000000021','e3000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000010','cancelled','2026-10-15T19:00:00Z','2026-10-15T15:00:00Z');
do $$begin begin perform public.restore_cancelled_cleaning('e3000000-0000-0000-0000-000000000021');raise exception 'FAIL duplicate restored';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;end$$;
select 'Restore cleaning tests passed';
rollback;
