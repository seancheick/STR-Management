-- fixed_payout_amount remains the canonical total consumed by every payout view.
create table public.assignment_extras (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null references public.assignments(id) on delete cascade,
 description text not null check(length(btrim(description)) between 1 and 200),
 amount numeric(12,2) not null check(amount > 0 and amount <= 100000),
 kind text not null check(kind in ('service','reimbursement')),
 created_at timestamptz not null default now()
);
create index assignment_extras_job_idx on public.assignment_extras(assignment_id);
alter table public.assignment_extras enable row level security;
grant select on public.assignment_extras to authenticated;
revoke insert,update,delete on public.assignment_extras from authenticated,anon;
create policy "Job participants read itemized extras" on public.assignment_extras for select to authenticated
using (public.can_access_assignment(assignment_id));

create function public.assert_job_pay_editable(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare job public.assignments%rowtype;
begin
 select * into job from public.assignments where id=target_id for update;
 if job.id is null or not exists(select 1 from public.users where id=auth.uid() and active and role in ('owner','admin') and owner_id=job.owner_id) then
  raise exception 'Only the host can change job pay.';
 end if;
 if job.paid_at is not null or job.ledger_entry_id is not null then raise exception 'Paid or reconciled job pay is locked.'; end if;
 if exists(select 1 from public.cleaner_accounts c join public.properties p on p.id=job.property_id
  where c.cleaner_id=job.cleaner_id and c.owner_id=job.owner_id and (job.due_at at time zone coalesce(p.timezone,'America/New_York'))::date<=c.reconciled_through) then
  raise exception 'This date is already reconciled in the ledger. Record a ledger adjustment instead.';
 end if;
 if exists(select 1 from public.payout_entries e where e.assignment_id=target_id) then
  raise exception 'This job has payout report history. Record a separate adjustment instead.';
 end if;
end $$;
revoke all on function public.assert_job_pay_editable(uuid) from public,anon,authenticated;

create function public.add_assignment_extra(target_id uuid, extra_id uuid, extra_description text, extra_amount numeric, extra_kind text)
returns void language plpgsql security definer set search_path='' as $$
declare existing public.assignment_extras%rowtype;
begin
 perform public.assert_job_pay_editable(target_id);
 if exists(select 1 from public.assignments where id=target_id and (cleaner_id is null or fixed_payout_amount is null or status='cancelled')) then raise exception 'Choose a cleaner and set cleaning pay before adding extras.'; end if;
 if extra_amount is null or extra_amount<=0 or extra_amount>100000 or extra_amount<>round(extra_amount,2)
  or extra_description is null or length(btrim(extra_description)) not between 1 and 200
  or extra_kind is null or extra_kind not in ('service','reimbursement') then raise exception 'Enter a description and a valid positive amount with up to two decimal places.'; end if;
 select * into existing from public.assignment_extras where id=extra_id;
 if existing.id is not null then
  if existing.assignment_id=target_id and existing.description=btrim(extra_description) and existing.amount=extra_amount and existing.kind=extra_kind then return; end if;
  raise exception 'This extra was already saved with different details.';
 end if;
 insert into public.assignment_extras(id,assignment_id,description,amount,kind) values(extra_id,target_id,btrim(extra_description),extra_amount,extra_kind);
 update public.assignments set fixed_payout_amount=fixed_payout_amount+extra_amount where id=target_id;
 insert into public.assignment_notes(assignment_id,user_id,note_type,body)
 values(target_id,auth.uid(),'admin_pay','Added '||extra_kind||': '||btrim(extra_description)||' ($'||extra_amount||')');
end $$;
revoke all on function public.add_assignment_extra(uuid,uuid,text,numeric,text) from public,anon;
grant execute on function public.add_assignment_extra(uuid,uuid,text,numeric,text) to authenticated;

create function public.remove_assignment_extra(target_id uuid, extra_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare item public.assignment_extras%rowtype;
begin
 perform public.assert_job_pay_editable(target_id);
 delete from public.assignment_extras where id=extra_id and assignment_id=target_id returning * into item;
 if item.id is null then return; end if;
 update public.assignments set fixed_payout_amount=fixed_payout_amount-item.amount where id=target_id;
 insert into public.assignment_notes(assignment_id,user_id,note_type,body)
 values(target_id,auth.uid(),'admin_pay','Removed '||item.kind||': '||item.description||' ($'||item.amount||')');
end $$;
revoke all on function public.remove_assignment_extra(uuid,uuid) from public,anon;
grant execute on function public.remove_assignment_extra(uuid,uuid) to authenticated;

-- A cleaner can complete a job, but cannot change its money via direct API calls.
create function public.guard_assignment_pay() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.fixed_payout_amount is distinct from old.fixed_payout_amount then
  if auth.uid() is not null and not exists(select 1 from public.users where id=auth.uid() and active and role in ('owner','admin') and owner_id=old.owner_id) then
   raise exception 'Only the host can change job pay.';
  end if;
  if auth.uid() is not null then perform public.assert_job_pay_editable(old.id); end if;
  if new.fixed_payout_amount is null and exists(select 1 from public.assignment_extras where assignment_id=old.id) then raise exception 'Total pay is required while extras exist.'; end if;
  if new.fixed_payout_amount < coalesce((select sum(amount) from public.assignment_extras where assignment_id=old.id),0) then
   raise exception 'Total pay cannot be less than its itemized extras.';
  end if;
 end if;
 return new;
end $$;
create trigger guard_assignment_pay before update on public.assignments for each row execute function public.guard_assignment_pay();
revoke all on function public.guard_assignment_pay() from public,anon,authenticated;
