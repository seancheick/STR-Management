begin;
insert into auth.users(id,email) values ('f1000000-0000-0000-0000-000000000001','adjust-owner@test'),('f1000000-0000-0000-0000-000000000002','adjust-cleaner@test'),('f1000000-0000-0000-0000-000000000003','adjust-other@test');
update public.users set role='owner',owner_id=id where id in ('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000003');
update public.users set role='cleaner',owner_id='f1000000-0000-0000-0000-000000000001' where id='f1000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.post_cleaner_account_adjustment('f1000000-0000-0000-0000-000000000010','f1000000-0000-0000-0000-000000000002','2026-05-03',30,'charge_correction','Verified third bedroom');
select public.post_cleaner_account_adjustment('f1000000-0000-0000-0000-000000000010','f1000000-0000-0000-0000-000000000002','2026-05-03',30,'charge_correction','Verified third bedroom');
select public.post_cleaner_account_adjustment('f1000000-0000-0000-0000-000000000011','f1000000-0000-0000-0000-000000000002','2026-07-02',30,'charge_correction','Verified third bedroom');
do $$ begin
 if (select sum(amount) from public.cleaner_account_adjustments)<>60 then raise exception 'FAIL duplicate adjustment'; end if;
 begin perform public.post_cleaner_account_adjustment('f1000000-0000-0000-0000-000000000010','f1000000-0000-0000-0000-000000000002','2026-05-03',31,'charge_correction','Verified third bedroom');raise exception 'FAIL conflicting replay';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.post_cleaner_account_adjustment(gen_random_uuid(),'f1000000-0000-0000-0000-000000000002',current_date,1.001,'charge_correction','Fraction cents');raise exception 'FAIL fractional cents';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin update public.cleaner_account_adjustments set amount=1;raise exception 'FAIL mutable adjustment';exception when insufficient_privilege then null;end;
 begin delete from public.cleaner_account_adjustments;raise exception 'FAIL deletable adjustment';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.cleaner_account_adjustments)then raise exception 'FAIL cross tenant read';end if;
 begin perform public.post_cleaner_account_adjustment('f1000000-0000-0000-0000-000000000010','f1000000-0000-0000-0000-000000000002','2026-05-03',30,'charge_correction','Verified third bedroom');raise exception 'FAIL cross tenant replay';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
end $$;
reset role;
select 'cleaner account adjustments tests passed';
rollback;
