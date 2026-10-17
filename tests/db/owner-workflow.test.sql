begin;
insert into auth.users(id,email) values
 ('c0000000-0000-0000-0000-000000000001','workflow-owner@test'),('c0000000-0000-0000-0000-000000000002','workflow-cleaner@test'),('d0000000-0000-0000-0000-000000000001','workflow-other@test');
update public.users set role='owner',owner_id=id where id in ('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001');
update public.users set role='cleaner',owner_id='c0000000-0000-0000-0000-000000000001' where id='c0000000-0000-0000-0000-000000000002';
insert into public.properties(id,owner_id,name) values('c0000000-0000-0000-0000-000000000010','c0000000-0000-0000-0000-000000000001','Workflow house');
insert into public.assignments(id,owner_id,property_id,due_at,checkout_at) values
 ('c0000000-0000-0000-0000-000000000020','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000010',now(),now()-interval '1 day'),
 ('c0000000-0000-0000-0000-000000000021','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000010',now()+interval '2 day',now()+interval '1 day');
insert into public.assignments(id,owner_id,property_id,due_at,checkout_at,fixed_payout_amount) values
 ('c0000000-0000-0000-0000-000000000022','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000010',now()-interval '2 day',null,90),
 ('c0000000-0000-0000-0000-000000000023','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000010',now()+interval '2 day',null,90);
insert into public.assignments(id,owner_id,property_id,due_at) values
 ('c0000000-0000-0000-0000-000000000024','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000010',now()-interval '3 day'),
 ('c0000000-0000-0000-0000-000000000025','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000010',now()-interval '4 day'),
 ('c0000000-0000-0000-0000-000000000026','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000010',now()+interval '4 day');
select set_config('request.jwt.claims','{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select * from public.assign_cleaning_batch_mode(array['c0000000-0000-0000-0000-000000000020'::uuid],'c0000000-0000-0000-0000-000000000002','direct');
select * from public.assign_cleaning_batch(array['c0000000-0000-0000-0000-000000000021'::uuid],'c0000000-0000-0000-0000-000000000002');
do $$ begin
 if not exists(select 1 from public.assignments where id='c0000000-0000-0000-0000-000000000020' and status='confirmed' and ack_status='accepted') then raise exception 'FAIL direct assignment'; end if;
 if not exists(select 1 from public.assignments where id='c0000000-0000-0000-0000-000000000021' and status='assigned' and ack_status='pending') then raise exception 'FAIL request assignment'; end if;
 begin perform public.owner_manage_cleaning('c0000000-0000-0000-0000-000000000021','complete',null,'{}','Reviewed with cleaner',true); raise exception 'FAIL future completion permitted'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin perform public.owner_manage_cleaning('c0000000-0000-0000-0000-000000000020','complete',null,'{}','',true); raise exception 'FAIL missing reason permitted'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select public.owner_manage_cleaning('c0000000-0000-0000-0000-000000000020','complete',null,'{}','Verified with cleaner',true);
select public.owner_manage_cleaning('c0000000-0000-0000-0000-000000000022','complete','c0000000-0000-0000-0000-000000000002','{}','Past manual cleaning confirmed',true);
do $$ begin
 if not exists(select 1 from public.assignments where id='c0000000-0000-0000-0000-000000000022' and status='approved' and cleaner_id='c0000000-0000-0000-0000-000000000002' and fixed_payout_amount=90 and paid_at is null) then raise exception 'FAIL manual history not completed'; end if;
 begin perform public.owner_manage_cleaning('c0000000-0000-0000-0000-000000000023','complete','c0000000-0000-0000-0000-000000000002','{}','Future manual cleaning',true); raise exception 'FAIL future manual completion'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 begin perform public.owner_manage_cleaning('c0000000-0000-0000-0000-000000000022','complete',null,'{}','Duplicate completion',true); exception when others then if sqlerrm not like 'This cleaning cannot%' then raise; end if; end;
 if (select count(*) from public.assignment_events where assignment_id='c0000000-0000-0000-0000-000000000022' and event_type='owner_complete')<>1 then raise exception 'FAIL duplicate completion audit'; end if;
end $$;
do $$ begin
 begin perform public.complete_cleaning_batch(array['c0000000-0000-0000-0000-000000000024'::uuid,'c0000000-0000-0000-0000-000000000026'::uuid],'c0000000-0000-0000-0000-000000000002','Confirmed by host',true); raise exception 'FAIL future batch completion'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
 if exists(select 1 from public.assignments where id='c0000000-0000-0000-0000-000000000024' and status='approved') then raise exception 'FAIL partial batch completion persisted'; end if;
 if public.complete_cleaning_batch(array['c0000000-0000-0000-0000-000000000024'::uuid,'c0000000-0000-0000-0000-000000000025'::uuid],'c0000000-0000-0000-0000-000000000002','Confirmed by host',true)<>2 then raise exception 'FAIL batch completion count'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.assignments where id='c0000000-0000-0000-0000-000000000020' and status='approved' and completed_at is not null and approved_at is not null and paid_at is null) then raise exception 'FAIL completed state'; end if;
 if not exists(select 1 from public.audit_logs where entity_id='c0000000-0000-0000-0000-000000000020' and action='owner_complete' and metadata->>'reason'='Verified with cleaner') then raise exception 'FAIL audit missing'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 begin perform public.owner_manage_cleaning('c0000000-0000-0000-0000-000000000021','direct','c0000000-0000-0000-0000-000000000002'); raise exception 'FAIL cross tenant operation'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
rollback;
select 'Owner workflow tests passed';
