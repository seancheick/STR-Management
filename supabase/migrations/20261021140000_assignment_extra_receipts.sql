begin;
-- Durable add receipts survive removal, so delayed retries cannot recreate charges.
create table public.assignment_extra_receipts (
 id uuid primary key,
 assignment_id uuid not null references public.assignments(id) on delete cascade,
 description text not null,
 amount numeric(12,2) not null,
 kind text not null,
 removed_at timestamptz
);
alter table public.assignment_extra_receipts enable row level security;
revoke all on public.assignment_extra_receipts from public,anon,authenticated;
insert into public.assignment_extra_receipts(id,assignment_id,description,amount,kind)
 select id,assignment_id,description,amount,kind from public.assignment_extras;
create or replace function app_private.add_assignment_extra(target_id uuid, extra_id uuid, extra_description text, extra_amount numeric, extra_kind text)
returns void language plpgsql security definer set search_path='' as $$
declare existing public.assignment_extra_receipts%rowtype; job public.assignments%rowtype;
begin
 select * into job from public.assignments where id=target_id for update;
 if job.id is null or not exists(select 1 from public.users where id=auth.uid() and active and role in ('owner','admin') and owner_id=job.owner_id) then raise exception 'Only the host can change job pay.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(extra_id::text,1));

 if extra_amount is null or extra_amount<=0 or extra_amount>100000 or extra_amount<>round(extra_amount,2)
  or extra_description is null or length(btrim(extra_description)) not between 1 and 200
  or extra_kind is null or extra_kind not in ('service','reimbursement') then raise exception 'Enter a description and a valid positive amount with up to two decimal places.'; end if;
 select * into existing from public.assignment_extra_receipts where id=extra_id;
 if existing.id is not null then
  if existing.assignment_id=target_id and existing.description=btrim(extra_description) and existing.amount=extra_amount and existing.kind=extra_kind then return; end if;
  raise exception 'This extra was already saved with different details.';
 end if;
 perform public.assert_job_pay_editable(target_id);
 if job.cleaning_scope_total is not null or app_private.cleaning_scope_financial_locked(target_id) then raise exception 'Cleaning pay is locked. Use a scope correction or ledger adjustment.'; end if;
 if job.cleaner_id is null or job.fixed_payout_amount is null or job.status='cancelled' then raise exception 'Choose a cleaner and set cleaning pay before adding extras.'; end if;
 insert into public.assignment_extra_receipts(id,assignment_id,description,amount,kind) values(extra_id,target_id,btrim(extra_description),extra_amount,extra_kind);
 insert into public.assignment_extras(id,assignment_id,description,amount,kind) values(extra_id,target_id,btrim(extra_description),extra_amount,extra_kind);
 update public.assignments set fixed_payout_amount=fixed_payout_amount+extra_amount where id=target_id;
 insert into public.assignment_notes(assignment_id,user_id,note_type,body)
 values(target_id,auth.uid(),'admin_pay','Added '||extra_kind||': '||btrim(extra_description)||' ($'||extra_amount||')');
end $$;
create or replace function app_private.remove_assignment_extra(target_id uuid, extra_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare item public.assignment_extras%rowtype; job public.assignments%rowtype;
begin
 select * into job from public.assignments where id=target_id for update;
 if job.id is null or not exists(select 1 from public.users where id=auth.uid() and active and role in ('owner','admin') and owner_id=job.owner_id) then raise exception 'Only the host can change job pay.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(extra_id::text,1));
 select * into item from public.assignment_extras where id=extra_id and assignment_id=target_id;
 if item.id is null then return; end if;
 perform public.assert_job_pay_editable(target_id);
 if job.cleaning_scope_total is not null or app_private.cleaning_scope_financial_locked(target_id) then raise exception 'Cleaning pay is locked. Use a scope correction or ledger adjustment.'; end if;
 if job.cleaner_id is null or job.fixed_payout_amount is null or job.status='cancelled' then raise exception 'Choose a cleaner and set cleaning pay before adding extras.'; end if;
 update public.assignment_extra_receipts set removed_at=now() where id=extra_id;
 delete from public.assignment_extras where id=extra_id and assignment_id=target_id returning * into item;
 if item.id is null then return; end if;
 update public.assignments set fixed_payout_amount=fixed_payout_amount-item.amount where id=target_id;
 insert into public.assignment_notes(assignment_id,user_id,note_type,body)
 values(target_id,auth.uid(),'admin_pay','Removed '||item.kind||': '||item.description||' ($'||item.amount||')');
end $$;

commit;
