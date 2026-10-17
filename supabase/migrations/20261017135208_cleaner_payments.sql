begin;
create table public.cleaner_payments (
 id uuid primary key, owner_id uuid not null references public.users(id),
 cleaner_id uuid not null references public.users(id),
 amount numeric(12,2) not null check(amount>0 and amount<=100000),
 payment_date date not null, method text not null check(method in ('zelle','venmo','cash','check','bank_transfer','other')),
 reference text check(length(reference)<=120), note text check(length(note)<=1000),
 assignment_id uuid references public.assignments(id), source_key text,
 created_at timestamptz not null default now(), created_by uuid not null references public.users(id),
 voided_at timestamptz, voided_by uuid references public.users(id), void_reason text,
 unique(owner_id,source_key)
);
create index cleaner_payments_account on public.cleaner_payments(owner_id,cleaner_id,payment_date);
alter table public.cleaner_payments enable row level security;
revoke all on public.cleaner_payments from anon,authenticated;
grant select on public.cleaner_payments to authenticated;
grant all on public.cleaner_payments to service_role;
create policy cleaner_payments_read on public.cleaner_payments for select to authenticated using
 (owner_id=(select public.current_owner_id()) and ((cleaner_id=(select auth.uid())) or (select public.current_app_user_role()) in ('owner','admin','supervisor')));

create function app_private.payment_owner() returns uuid language plpgsql security definer set search_path='' as $$
declare tenant uuid;
begin
 select owner_id into tenant from public.users where id=auth.uid() and active and role in ('owner','admin');
 if tenant is null then raise exception 'Only an active host can record payments.'; end if;
 return tenant;
end $$;

create function app_private.record_cleaner_payment(payment_id uuid,target_cleaner uuid,paid_amount numeric,paid_date date,paid_method text,payment_reference text default null,payment_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid; existing public.cleaner_payments%rowtype;
begin
 tenant:=app_private.payment_owner();
 perform 1 from public.users where id=target_cleaner and owner_id=tenant and role='cleaner' for update;
 if not found then raise exception 'Choose a cleaner on your team.'; end if;
 if payment_id is null or paid_amount is null or paid_amount<=0 or paid_amount>100000 or paid_amount<>round(paid_amount,2) or paid_date is null or paid_date>(now() at time zone 'America/New_York')::date or paid_method is null or paid_method not in ('zelle','venmo','cash','check','bank_transfer','other') or length(payment_reference)>120 or length(payment_note)>1000 then raise exception 'Enter a valid payment amount, date and method.'; end if;
 select * into existing from public.cleaner_payments where id=payment_id;
 if found then
  if existing.owner_id=tenant and existing.cleaner_id=target_cleaner and existing.amount=paid_amount and existing.payment_date=paid_date and existing.method=paid_method and existing.reference is not distinct from nullif(btrim(payment_reference),'') and existing.note is not distinct from nullif(btrim(payment_note),'') and existing.assignment_id is null and existing.voided_at is null then return; end if;
  raise exception 'This payment was already saved with different details or voided.';
 end if;
 if exists(select 1 from public.cleaner_accounts where owner_id=tenant and cleaner_id=target_cleaner and paid_date<=reconciled_through) then raise exception 'Payment date must be after the reconciled history.'; end if;
 insert into public.cleaner_payments(id,owner_id,cleaner_id,amount,payment_date,method,reference,note,created_by)
 values(payment_id,tenant,target_cleaner,paid_amount,paid_date,paid_method,nullif(btrim(payment_reference),''),nullif(btrim(payment_note),''),auth.uid());
end $$;

create function app_private.void_cleaner_payment(payment_id uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid; item public.cleaner_payments%rowtype;
begin
 tenant:=app_private.payment_owner();
 if reason is null or length(btrim(reason)) not between 1 and 1000 then raise exception 'A reason is required.'; end if;
 select * into item from public.cleaner_payments where id=payment_id and owner_id=tenant for update;
 if not found then raise exception 'Payment not found.'; end if;
 if item.assignment_id is not null then raise exception 'Undo the job payment from the job or report.'; end if;
 update public.cleaner_payments set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(reason) where id=payment_id and voided_at is null;
end $$;

create function app_private.set_cleaning_jobs_paid(job_ids uuid[],is_paid boolean,paid_method text default 'other',payment_reference text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare tenant uuid; job public.assignments%rowtype; total integer:=0; prior boolean; job_amount numeric; local_day date; proof_at timestamptz; prior_payment public.cleaner_payments%rowtype;
begin
 tenant:=app_private.payment_owner();
 if is_paid is null or job_ids is null or cardinality(job_ids)=0 or paid_method is null or paid_method not in ('zelle','venmo','cash','check','bank_transfer','other') or length(payment_reference)>120 then raise exception 'Invalid payment input.'; end if;
 for job in select * from public.assignments where id=any(job_ids) order by id for update loop
  if job.owner_id<>tenant then raise exception 'Job not found on your team.'; end if;
  if job.cleaner_id is null or not exists(select 1 from public.users where id=job.cleaner_id and owner_id=tenant and role='cleaner' and active) then raise exception 'Choose an active cleaner.'; end if;
  select (job.due_at at time zone coalesce(case when lp.id is not null then lp.timezone else p.timezone end,'America/New_York'))::date into local_day from public.properties p left join public.properties lp on lp.id=job.listing_property_id where p.id=job.property_id;
  if job.ledger_entry_id is not null or exists(select 1 from public.cleaner_accounts where owner_id=tenant and cleaner_id=job.cleaner_id and local_day<=reconciled_through) then raise exception 'Reconciled job payments are locked.'; end if;
  if is_paid then
   if job.status not in ('approved','completed_pending_review') then raise exception 'Complete the job before recording payment.'; end if;
   select * into prior_payment from public.cleaner_payments where owner_id=tenant and assignment_id=job.id and voided_at is null order by created_at limit 1;
   proof_at:=coalesce(job.paid_at,
    (select min(e.paid_at) from public.payout_entries e where e.assignment_id=job.id and e.status='included'),
    (select min(b.paid_at) from public.payout_entries e join public.payout_batches b on b.id=e.batch_id where e.assignment_id=job.id and e.status='included' and b.status='paid'),
    prior_payment.created_at);
   prior:=proof_at is not null;
   if prior then
    -- Carry the original proof onto the job so cancelling/excluding a report
    -- cannot turn a paid job into a new charge. Never issue another payment.
    update public.assignments set paid_at=proof_at,
      payment_method=coalesce(job.payment_method,prior_payment.method,'other'),
      payment_reference=coalesce(job.payment_reference,prior_payment.reference),
      marked_paid_by_user_id=coalesce(job.marked_paid_by_user_id,prior_payment.created_by,auth.uid())
      where id=job.id and paid_at is null;
    update public.payout_entries set paid_at=proof_at,paid_by_id=coalesce(prior_payment.created_by,auth.uid())
      where assignment_id=job.id and status='included' and paid_at is null;
    continue;
   end if;
   -- The report snapshot is the payable total once an included report exists.
   select e.amount into job_amount from public.payout_entries e join public.payout_batches b on b.id=e.batch_id where e.assignment_id=job.id and e.status='included' and b.status<>'cancelled' order by e.created_at desc limit 1;
   job_amount:=coalesce(job_amount,job.fixed_payout_amount,0);
   if job_amount<=0 then raise exception 'Set a positive job total before recording payment.'; end if;
   insert into public.cleaner_payments(id,owner_id,cleaner_id,amount,payment_date,method,reference,assignment_id,source_key,created_by)
   values(gen_random_uuid(),tenant,job.cleaner_id,job_amount,(now() at time zone 'America/New_York')::date,paid_method,nullif(btrim(payment_reference),''),job.id,'job:'||job.id,auth.uid());
   update public.assignments set paid_at=now(),payment_method=paid_method,payment_reference=nullif(btrim(set_cleaning_jobs_paid.payment_reference),''),marked_paid_by_user_id=auth.uid() where id=job.id;
   update public.payout_entries set paid_at=now(),paid_by_id=auth.uid() where assignment_id=job.id and status='included';
  else
   if exists(select 1 from public.payout_entries e join public.payout_batches b on b.id=e.batch_id where e.assignment_id=job.id and e.status='included' and b.status='paid') then raise exception 'Paid report history is locked.'; end if;
   update public.cleaner_payments set voided_at=now(),voided_by=auth.uid(),void_reason='Job payment undone',source_key=null where owner_id=tenant and assignment_id=job.id and voided_at is null;
   update public.assignments set paid_at=null,payment_method=null,payment_reference=null,marked_paid_by_user_id=null where id=job.id;
   update public.payout_entries set paid_at=null,paid_by_id=null where assignment_id=job.id and status='included';
  end if;
  insert into public.assignment_notes(assignment_id,user_id,note_type,body) values(job.id,auth.uid(),'admin_pay',case when is_paid then 'Recorded job payment' else 'Undid job payment' end);
  total:=total+1;
 end loop;
 if (select count(*) from public.assignments where id=any(job_ids))<>(select count(distinct x) from unnest(job_ids) x) then raise exception 'Job not found.'; end if;
 return total;
end $$;

create function app_private.set_payout_entry_paid(target_entry uuid,is_paid boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare tenant uuid; item public.payout_entries%rowtype; batch public.payout_batches%rowtype;
begin
 tenant:=app_private.payment_owner();
 select * into item from public.payout_entries where id=target_entry and owner_id=tenant;
 if not found or item.status<>'included' then raise exception 'Included report line not found.'; end if;
 select * into batch from public.payout_batches where id=item.batch_id for update;
 if batch.status not in ('approved','paid') then raise exception 'Approve the report before recording payments.'; end if;
 perform app_private.set_cleaning_jobs_paid(array[item.assignment_id],is_paid,'other',null);
 return item.batch_id;
end $$;

create function app_private.pay_payout_batch(target_batch uuid) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid; batch public.payout_batches%rowtype; ids uuid[];
begin
 tenant:=app_private.payment_owner();
 select * into batch from public.payout_batches where id=target_batch and owner_id=tenant for update;
 if not found then raise exception 'Report not found.'; end if;
 if batch.status='paid' then return; end if;
 if batch.status<>'approved' then raise exception 'Approve the report before recording payments.'; end if;
 select array_agg(assignment_id order by assignment_id) into ids from public.payout_entries where batch_id=target_batch and status='included';
 if ids is null then raise exception 'There are no included jobs to pay.'; end if;
 perform app_private.set_cleaning_jobs_paid(ids,true,'other',null);
 update public.payout_batches set status='paid',paid_at=now() where id=target_batch;
end $$;

create function public.record_cleaner_payment(payment_id uuid,target_cleaner uuid,paid_amount numeric,paid_date date,paid_method text,payment_reference text default null,payment_note text default null) returns void language sql security invoker set search_path='' as $$ select app_private.record_cleaner_payment(payment_id,target_cleaner,paid_amount,paid_date,paid_method,payment_reference,payment_note); $$;
revoke all on function public.record_cleaner_payment(uuid,uuid,numeric,date,text,text,text),app_private.record_cleaner_payment(uuid,uuid,numeric,date,text,text,text) from public,anon;
grant execute on function public.record_cleaner_payment(uuid,uuid,numeric,date,text,text,text),app_private.record_cleaner_payment(uuid,uuid,numeric,date,text,text,text) to authenticated;

create function public.void_cleaner_payment(payment_id uuid,reason text) returns void language sql security invoker set search_path='' as $$ select app_private.void_cleaner_payment(payment_id,reason); $$;
revoke all on function public.void_cleaner_payment(uuid,text),app_private.void_cleaner_payment(uuid,text) from public,anon;
grant execute on function public.void_cleaner_payment(uuid,text),app_private.void_cleaner_payment(uuid,text) to authenticated;

create function public.set_cleaning_jobs_paid(job_ids uuid[],is_paid boolean,paid_method text default 'other',payment_reference text default null) returns integer language sql security invoker set search_path='' as $$ select app_private.set_cleaning_jobs_paid(job_ids,is_paid,paid_method,payment_reference); $$;
revoke all on function public.set_cleaning_jobs_paid(uuid[],boolean,text,text),app_private.set_cleaning_jobs_paid(uuid[],boolean,text,text) from public,anon;
grant execute on function public.set_cleaning_jobs_paid(uuid[],boolean,text,text),app_private.set_cleaning_jobs_paid(uuid[],boolean,text,text) to authenticated;

create function public.set_payout_entry_paid(target_entry uuid,is_paid boolean) returns uuid language sql security invoker set search_path='' as $$ select app_private.set_payout_entry_paid(target_entry,is_paid); $$;
revoke all on function public.set_payout_entry_paid(uuid,boolean),app_private.set_payout_entry_paid(uuid,boolean) from public,anon;
grant execute on function public.set_payout_entry_paid(uuid,boolean),app_private.set_payout_entry_paid(uuid,boolean) to authenticated;

create function public.pay_payout_batch(target_batch uuid) returns void language sql security invoker set search_path='' as $$ select app_private.pay_payout_batch(target_batch); $$;
revoke all on function public.pay_payout_batch(uuid),app_private.pay_payout_batch(uuid) from public,anon;
grant execute on function public.pay_payout_batch(uuid),app_private.pay_payout_batch(uuid) to authenticated;
revoke all on function app_private.payment_owner() from public,anon,authenticated;
-- Cleaner assignment updates must never create or remove payment proof.
create function app_private.guard_job_payment_proof() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.paid_at is distinct from old.paid_at or new.payment_method is distinct from old.payment_method or new.payment_reference is distinct from old.payment_reference or new.marked_paid_by_user_id is distinct from old.marked_paid_by_user_id)
 and auth.uid() is not null and not exists(select 1 from public.users where id=auth.uid() and active and role in ('owner','admin') and owner_id=old.owner_id and owner_id=new.owner_id) then
  raise exception 'Only the host can change payment proof.';
 end if;
 return new;
end $$;
revoke all on function app_private.guard_job_payment_proof() from public,anon,authenticated;
create trigger guard_job_payment_proof before update on public.assignments for each row execute function app_private.guard_job_payment_proof();

-- Reports that contain paid work are an audit record, including partial pay.
create function app_private.guard_paid_report_cancellation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='cancelled' and old.status is distinct from new.status then
  perform 1 from public.assignments a join public.payout_entries e on e.assignment_id=a.id where e.batch_id=old.id order by a.id for update of a;
  if old.paid_at is not null or old.status='paid' or exists(
   select 1 from public.payout_entries e join public.assignments a on a.id=e.assignment_id
   where e.batch_id=old.id and e.status='included' and (e.paid_at is not null or a.paid_at is not null or exists(select 1 from public.cleaner_payments p where p.assignment_id=a.id and p.voided_at is null))
  ) then raise exception 'Reports with payment history cannot be cancelled.'; end if;
 end if;
 return new;
end $$;
revoke all on function app_private.guard_paid_report_cancellation() from public,anon,authenticated;
create trigger guard_paid_report_cancellation before update on public.payout_batches for each row execute function app_private.guard_paid_report_cancellation();

-- Report totals are frozen snapshots of the job. Edit pay before generation.
create function app_private.guard_report_payment_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
declare batch_status public.payout_batch_status;
begin
 if new.amount is distinct from old.amount or new.assignment_id is distinct from old.assignment_id or new.cleaner_id is distinct from old.cleaner_id or new.owner_id is distinct from old.owner_id or new.batch_id is distinct from old.batch_id then raise exception 'Report pay is a snapshot. Edit job pay before generating a report.'; end if;
 if new.status is distinct from old.status then
  select status into batch_status from public.payout_batches where id=old.batch_id for update;
  if batch_status not in ('draft','cancelled') then raise exception 'Only draft report lines can be excluded.'; end if;
 end if;
 return new;
end $$;
revoke all on function app_private.guard_report_payment_snapshot() from public,anon,authenticated;
create trigger guard_report_payment_snapshot before update on public.payout_entries for each row execute function app_private.guard_report_payment_snapshot();
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cleaner_payments') then
  alter publication supabase_realtime add table public.cleaner_payments;
 end if;
end $$;
commit;
