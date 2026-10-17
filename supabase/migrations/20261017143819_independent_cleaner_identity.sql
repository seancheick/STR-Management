begin;
-- A payee identity is independent of whether that person has a login.
create table public.cleaners (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.users(id),
 user_id uuid unique references public.users(id) on delete set null,
 full_name text not null check(length(btrim(full_name)) between 1 and 120),
 email text, phone text, details text not null default '' check(length(details)<=2000),
 role public.user_role not null default 'cleaner',
 active boolean not null default true, availability text,
 is_1099_contractor boolean not null default false,
 created_at timestamptz not null default now()
);
create index cleaners_owner_active on public.cleaners(owner_id,active);
insert into public.cleaners(id,owner_id,user_id,full_name,email,phone,role,active,availability,is_1099_contractor,created_at)
select id,owner_id,id,full_name,email,phone,role,active,availability,coalesce(is_1099_contractor,false),created_at from public.users;
alter table public.cleaners enable row level security;
revoke all on public.cleaners from anon,authenticated;
grant select on public.cleaners to authenticated;
grant all on public.cleaners to service_role;
create policy "Read team payees" on public.cleaners for select to authenticated using
(owner_id=(select public.current_owner_id()) and ((select public.current_app_user_role()) in ('owner','admin','supervisor') or user_id=(select auth.uid())));

create function app_private.current_cleaner_id() returns uuid language sql stable security definer set search_path='' as $$
 select c.id from public.cleaners c join public.users u on u.id=c.user_id
 where c.user_id=auth.uid() and c.owner_id=u.owner_id and c.active and u.active and u.role='cleaner' and c.role='cleaner';
$$;
revoke all on function app_private.current_cleaner_id() from public,anon;
grant execute on function app_private.current_cleaner_id() to authenticated;

-- Read only the cleaner's own entries from approved/paid reports. A private
-- status check avoids a second RLS query hiding valid entries or exposing other
-- cleaners' batch totals.
create function app_private.cleaner_has_approved_batch(target_batch uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payout_batches b join public.payout_entries e on e.batch_id=b.id
 where b.id=target_batch and b.owner_id=app_private.current_owner_id() and b.status in ('approved','paid') and e.cleaner_id=app_private.current_cleaner_id());
$$;
revoke all on function app_private.cleaner_has_approved_batch(uuid) from public,anon;
grant execute on function app_private.cleaner_has_approved_batch(uuid) to authenticated;
alter policy payout_entries_select_authorized on public.payout_entries using
((owner_id=(select public.current_owner_id()) and (select public.current_app_user_role()) in ('owner','admin','supervisor'))
 or ((select public.current_app_user_role())='cleaner' and cleaner_id=(select app_private.current_cleaner_id()) and app_private.cleaner_has_approved_batch(batch_id)));

create function app_private.sync_cleaner_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.cleaners set owner_id=new.owner_id,full_name=new.full_name,email=new.email,phone=new.phone,role=new.role,active=new.active,
 availability=new.availability,is_1099_contractor=coalesce(new.is_1099_contractor,false) where user_id=new.id;
 if not found then
  insert into public.cleaners(id,owner_id,user_id,full_name,email,phone,role,active,availability,is_1099_contractor)
  values(new.id,new.owner_id,new.id,new.full_name,new.email,new.phone,new.role,new.active,new.availability,coalesce(new.is_1099_contractor,false));
 end if;
 return new;
end $$;
revoke all on function app_private.sync_cleaner_profile() from public,anon,authenticated;
create trigger sync_cleaner_profile after insert or update on public.users for each row execute function app_private.sync_cleaner_profile();

-- Preserve IDs and constraint names so existing jobs and joins keep their identity.
alter table public.assignments drop constraint assignments_cleaner_id_fkey, add constraint assignments_cleaner_id_fkey foreign key(cleaner_id) references public.cleaners(id) on delete set null;
alter table public.properties drop constraint properties_default_cleaner_id_fkey, add constraint properties_default_cleaner_id_fkey foreign key(default_cleaner_id) references public.cleaners(id) on delete set null;
alter table public.payout_batches drop constraint payout_batches_cleaner_filter_fkey, add constraint payout_batches_cleaner_filter_fkey foreign key(cleaner_filter) references public.cleaners(id) on delete set null;
alter table public.payout_entries drop constraint payout_entries_cleaner_id_fkey, add constraint payout_entries_cleaner_id_fkey foreign key(cleaner_id) references public.cleaners(id) on delete restrict;
alter table public.cleaner_accounts drop constraint cleaner_accounts_cleaner_id_fkey, add constraint cleaner_accounts_cleaner_id_fkey foreign key(cleaner_id) references public.cleaners(id);
alter table public.cleaner_payments drop constraint cleaner_payments_cleaner_id_fkey, add constraint cleaner_payments_cleaner_id_fkey foreign key(cleaner_id) references public.cleaners(id);

alter table public.recurring_tasks drop constraint recurring_tasks_assignee_id_fkey, add constraint recurring_tasks_assignee_id_fkey foreign key(assignee_id) references public.cleaners(id) on delete set null;

-- Only cleaner comparisons change. Actor IDs, note authors and notification
-- recipients remain authenticated user IDs. Policies retain their tenant checks.
do $$ declare p record; expr text; checked text; before_expr text; begin
 for p in select schemaname,tablename,policyname,qual,with_check from pg_policies where schemaname in ('public','storage') and (coalesce(qual,'') like '%cleaner_id%' or coalesce(with_check,'') like '%cleaner_id%') loop
  expr:=p.qual; checked:=p.with_check;
  expr:=regexp_replace(expr,'(\mcleaner_id\M\s*=\s*)auth.uid\(\)','\1app_private.current_cleaner_id()','g');
  expr:=regexp_replace(expr,'(\mcleaner_id\M\s*=\s*)\(\s*SELECT\s+auth.uid\(\)\s+AS uid\s*\)','\1(SELECT app_private.current_cleaner_id())','g');
  checked:=regexp_replace(checked,'(\mcleaner_id\M\s*=\s*)auth.uid\(\)','\1app_private.current_cleaner_id()','g');
  checked:=regexp_replace(checked,'(\mcleaner_id\M\s*=\s*)\(\s*SELECT\s+auth.uid\(\)\s+AS uid\s*\)','\1(SELECT app_private.current_cleaner_id())','g');
  if expr is distinct from p.qual then execute format('alter policy %I on %I.%I using (%s)',p.policyname,p.schemaname,p.tablename,expr); end if;
  if checked is distinct from p.with_check then execute format('alter policy %I on %I.%I with check (%s)',p.policyname,p.schemaname,p.tablename,checked); end if;
 end loop;
end $$;

CREATE OR REPLACE FUNCTION app_private.can_access_property(target_property_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
 select exists (
  select 1 from public.properties p
  where p.id=target_property_id
    and p.owner_id=app_private.current_owner_id()
    and (
      app_private.current_app_user_role() in ('owner','admin','supervisor')
      or (
       app_private.current_app_user_role()='cleaner'
       and exists (
        select 1 from public.assignments a
        where a.owner_id=p.owner_id and a.cleaner_id=app_private.current_cleaner_id()
          and (a.property_id=p.id or coalesce(a.listing_property_id,a.property_id)=p.id)
       )
      )
    )
 );
$function$
;

CREATE OR REPLACE FUNCTION app_private.can_access_assignment(target_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.assignments
    where id = target_assignment_id
      and (
        (owner_id = app_private.current_owner_id()
          and app_private.current_app_user_role() in ('owner', 'admin', 'supervisor'))
        or (app_private.current_app_user_role() = 'cleaner' and cleaner_id = app_private.current_cleaner_id())
      )
  )
$function$
;

CREATE OR REPLACE FUNCTION app_private.decline_cleaning_job(target_id uuid, decline_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  job public.assignments%rowtype;
  responder public.users%rowtype;
begin
  select * into responder from public.users where id = auth.uid() and active;
  if responder.id is null then raise exception 'Sign in to respond to a cleaning.'; end if;
  if decline_reason is null or decline_reason not in ('sick', 'conflict', 'distance', 'other') then
    raise exception 'Choose a valid decline reason.';
  end if;
  select * into job from public.assignments where id = target_id for update;
  if job.id is null or job.cleaner_id is distinct from app_private.current_cleaner_id()
    or job.owner_id is distinct from responder.owner_id
    or job.status <> 'assigned' or job.ack_status <> 'pending' then
    raise exception 'Job is no longer available to decline.';
  end if;
  insert into public.job_messages(assignment_id, author_id, author_role, body, message_type, metadata)
  values (target_id, responder.id, responder.role,
    case decline_reason when 'sick' then 'called out sick' when 'conflict' then 'has a conflict'
    when 'distance' then 'is too far away' else 'declined the job' end,
    'decline', jsonb_build_object('reason', decline_reason));
  update public.assignments set cleaner_id = null, status = 'unassigned', ack_status = 'declined', accepted_at = null
  where id = target_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION app_private.assign_cleaning_batch_mode(job_ids uuid[], target_cleaner uuid, assignment_mode text)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor public.users%rowtype; job_id uuid;
begin
 select * into actor from public.users where users.id=auth.uid() and active;
 if actor.id is null or actor.role not in ('owner','admin') then raise exception 'Only the host can assign cleanings.'; end if;
 if assignment_mode is null or assignment_mode not in ('request','direct') then raise exception 'Choose request or direct assignment.'; end if;
 if coalesce(array_length(job_ids,1),0) not between 1 and 1000 then raise exception 'Select 1 to 1,000 cleanings.'; end if;
 if not exists(select 1 from public.cleaners where cleaners.id=target_cleaner and owner_id=actor.owner_id and role='cleaner' and active) then raise exception 'Choose an active cleaner from your team.'; end if;
 for job_id in select a.id from public.assignments a where a.id=any(job_ids) and a.owner_id=actor.owner_id and a.status='unassigned' and a.cleaner_id is null order by a.id for update loop
  perform public.owner_manage_cleaning(job_id,assignment_mode,target_cleaner);
  id:=job_id; return next;
 end loop;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.owner_manage_cleaning(target_id uuid, operation text, target_cleaner uuid DEFAULT NULL::uuid, assignment_patch jsonb DEFAULT '{}'::jsonb, audit_reason text DEFAULT NULL::text, confirmed boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor public.users%rowtype; job public.assignments%rowtype; updated public.assignments%rowtype; chosen uuid; changed boolean; total numeric;
begin
 select * into actor from public.users where id=auth.uid() and active;
 if actor.id is null or actor.role not in ('owner','admin') then raise exception 'Only the host can manage cleanings.'; end if;
 if operation is null or operation not in ('edit','request','direct','complete') then raise exception 'Choose a valid cleaning action.'; end if;
 select * into job from public.assignments where id=target_id and owner_id=actor.owner_id for update;
 if job.id is null then raise exception 'Cleaning not found.'; end if;
 if operation='complete' then
  if not confirmed or length(trim(coalesce(audit_reason,''))) not between 3 and 1000 then raise exception 'Confirm completion and enter a reason (3–1,000 characters).'; end if;
  if job.status not in ('unassigned','assigned','confirmed','in_progress','completed_pending_review','needs_reclean') then raise exception 'This cleaning cannot be completed from its current state.'; end if;
  chosen:=coalesce(target_cleaner,job.cleaner_id);
  if coalesce(job.checkout_at,job.due_at)>now() then raise exception 'The checkout or service date must have passed before completion.'; end if;
 else
  if job.status not in ('unassigned','assigned','confirmed','needs_reclean') then raise exception 'This cleaning can no longer be edited.'; end if;
  chosen:=case when operation='edit' then nullif(assignment_patch->>'cleaner_id','')::uuid else target_cleaner end;
 end if;
 if chosen is not null and not exists(select 1 from public.cleaners where id=chosen and owner_id=actor.owner_id and role='cleaner' and active) then raise exception 'Choose an active cleaner from your team.'; end if;
 if operation in ('request','direct','complete') and chosen is null then raise exception 'Choose a cleaner first.'; end if;
 if operation='request' and exists(select 1 from public.cleaners where id=chosen and user_id is null) then raise exception 'This contractor has no app access. Choose direct assignment or record completed work.'; end if;
 changed:=chosen is distinct from job.cleaner_id;
 -- Cleaner/date changes alter report ownership and reconciliation boundaries.
 if changed or (operation='edit' and ((assignment_patch->>'due_at')::timestamptz is distinct from job.due_at)) then
  perform public.assert_job_pay_editable(job.id);
 end if;
 if operation='edit' then
  total:=nullif(assignment_patch->>'fixed_payout_amount','')::numeric;
  if assignment_patch ? 'original_fixed_payout_amount' then
   if total is not distinct from nullif(assignment_patch->>'original_fixed_payout_amount','')::numeric then total:=job.fixed_payout_amount;
   elsif job.fixed_payout_amount is distinct from nullif(assignment_patch->>'original_fixed_payout_amount','')::numeric then raise exception 'Job pay changed. Close and reopen the job before editing its total.';
   end if;
  end if;
  if total is distinct from job.fixed_payout_amount then
   if job.paid_at is not null or job.ledger_entry_id is not null or exists(select 1 from public.payout_entries where assignment_id=job.id) then raise exception 'Payment history locks this cleaning total.'; end if;
   if coalesce(total,0)<coalesce((select sum(amount) from public.assignment_extras where assignment_id=job.id),0) then raise exception 'Total pay cannot be below its itemized extras.'; end if;
  end if;
  if total<=0 or (assignment_patch->>'expected_duration_min')::integer<=0 then raise exception 'Pay and duration must be positive.'; end if;
  if nullif(assignment_patch->>'due_at','') is null then raise exception 'Next check-in is required.'; end if;
  update public.assignments set due_at=(assignment_patch->>'due_at')::timestamptz, checkout_at=nullif(assignment_patch->>'checkout_at','')::timestamptz,
   cleaner_id=chosen,priority=(assignment_patch->>'priority')::public.assignment_priority,
   expected_duration_min=nullif(assignment_patch->>'expected_duration_min','')::integer,fixed_payout_amount=total,access_code=nullif(assignment_patch->>'access_code',''),
   status=case when chosen is null then 'unassigned'::public.assignment_status when changed then case when exists(select 1 from public.cleaners where id=chosen and user_id is null) then 'confirmed'::public.assignment_status else 'assigned'::public.assignment_status end else status end,
   ack_status=case when changed then case when exists(select 1 from public.cleaners where id=chosen and user_id is null) then 'accepted'::public.assignment_ack_status else 'pending'::public.assignment_ack_status end else ack_status end,accepted_at=case when changed then null else accepted_at end
   where id=job.id returning * into updated;
 else
  update public.assignments set cleaner_id=chosen,
   status=case when operation='complete' then 'approved'::public.assignment_status when operation='direct' then 'confirmed'::public.assignment_status else 'assigned'::public.assignment_status end,
   ack_status=case when operation='request' then 'pending'::public.assignment_ack_status else 'accepted'::public.assignment_ack_status end,
   accepted_at=case when operation='request' then null else coalesce(accepted_at,now()) end,
   completed_at=case when operation='complete' then coalesce(completed_at,now()) else completed_at end,
   approved_at=case when operation='complete' then now() else approved_at end
   where id=job.id returning * into updated;
 end if;
 -- Obsolete offers must never continue asking a cleaner to respond.
 update public.notifications set seen_at=coalesce(seen_at,now()) where assignment_id=job.id and notification_type='new_assignment';
 if chosen is not null and exists(select 1 from public.cleaners where id=chosen and user_id is not null) and (operation in ('request','direct','complete') or changed) then
  insert into public.notifications(owner_id,recipient_id,assignment_id,channel,status,notification_type,title,body)
  values(actor.owner_id,(select user_id from public.cleaners where id=chosen),job.id,'push','pending',case when updated.status='approved' then 'owner_completed' else 'new_assignment' end,case when updated.status='approved' then 'Cleaning marked completed' when updated.status='confirmed' then 'Cleaning confirmed by host' else 'New cleaning request' end,
   case when updated.status='approved' then 'The host recorded this cleaning as completed and approved. No response is needed.' when updated.status='confirmed' then 'Added to your schedule by the host. No acceptance is needed.' else 'Review the cleaning and accept or decline.' end);
 end if;
 if changed and job.cleaner_id is not null and exists(select 1 from public.cleaners where id=job.cleaner_id and user_id is not null) then
  insert into public.notifications(owner_id,recipient_id,assignment_id,channel,status,notification_type,title,body)
  values(actor.owner_id,(select user_id from public.cleaners where id=job.cleaner_id),job.id,'push','pending','assignment_removed','Cleaning removed from your schedule','The host reassigned or removed this cleaning. No response is needed.');
 end if;
 insert into public.assignment_events(assignment_id,event_type,actor_user_id,payload) values(job.id,'owner_'||operation,actor.id,jsonb_build_object('before_status',job.status,'after_status',updated.status,'reason',trim(audit_reason),'before_cleaner',job.cleaner_id,'after_cleaner',chosen));
 insert into public.audit_logs(owner_id,entity_type,entity_id,action,actor_user_id,metadata) values(actor.owner_id,'assignment',job.id,'owner_'||operation,actor.id,jsonb_build_object('reason',trim(audit_reason),'before',to_jsonb(job),'after',to_jsonb(updated)));
 return job.id;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.record_cleaner_payment(payment_id uuid, target_cleaner uuid, paid_amount numeric, paid_date date, paid_method text, payment_reference text DEFAULT NULL::text, payment_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tenant uuid; existing public.cleaner_payments%rowtype;
begin
 tenant:=app_private.payment_owner();
 perform 1 from public.cleaners where id=target_cleaner and owner_id=tenant and role='cleaner' for update;
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
end $function$
;

CREATE OR REPLACE FUNCTION app_private.set_cleaning_jobs_paid(job_ids uuid[], is_paid boolean, paid_method text DEFAULT 'other'::text, payment_reference text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tenant uuid; job public.assignments%rowtype; total integer:=0; prior boolean; job_amount numeric; local_day date; proof_at timestamptz; prior_payment public.cleaner_payments%rowtype;
begin
 tenant:=app_private.payment_owner();
 if is_paid is null or job_ids is null or cardinality(job_ids)=0 or paid_method is null or paid_method not in ('zelle','venmo','cash','check','bank_transfer','other') or length(payment_reference)>120 then raise exception 'Invalid payment input.'; end if;
 for job in select * from public.assignments where id=any(job_ids) order by id for update loop
  if job.owner_id<>tenant then raise exception 'Job not found on your team.'; end if;
  if job.cleaner_id is null or not exists(select 1 from public.cleaners where id=job.cleaner_id and owner_id=tenant and role='cleaner' and active) then raise exception 'Choose an active cleaner.'; end if;
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
end $function$
;

create function app_private.save_contractor(target_id uuid,contractor_name text,contractor_email text,contractor_phone text,contractor_details text,contractor_active boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.users%rowtype; existing public.cleaners%rowtype;
begin
 select * into actor from public.users where id=auth.uid() and active;
 if actor.id is null or actor.role not in ('owner','admin') then raise exception 'Only the host can manage contractors.'; end if;
 if target_id is null or length(btrim(coalesce(contractor_name,''))) not between 1 and 120 or length(coalesce(contractor_email,''))>254 or length(coalesce(contractor_phone,''))>40 or length(coalesce(contractor_details,''))>2000 then raise exception 'Enter a name and valid contact details.'; end if;
 if nullif(btrim(contractor_email),'') is not null and btrim(contractor_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
 select * into existing from public.cleaners where id=target_id for update;
 if found then
  if existing.owner_id<>actor.owner_id or existing.user_id is not null or existing.role<>'cleaner' then raise exception 'Choose a contractor without app access from your team.'; end if;
  update public.cleaners set full_name=btrim(contractor_name),email=nullif(lower(btrim(contractor_email)),''),phone=nullif(btrim(contractor_phone),''),details=coalesce(contractor_details,''),active=contractor_active where id=target_id;
 else
  insert into public.cleaners(id,owner_id,full_name,email,phone,details,active) values(target_id,actor.owner_id,btrim(contractor_name),nullif(lower(btrim(contractor_email)),''),nullif(btrim(contractor_phone),''),coalesce(contractor_details,''),contractor_active);
 end if;
 return target_id;
end $$;
create function public.save_contractor(target_id uuid,contractor_name text,contractor_email text,contractor_phone text,contractor_details text,contractor_active boolean default true)
returns uuid language sql security invoker set search_path='' as $$ select app_private.save_contractor(target_id,contractor_name,contractor_email,contractor_phone,contractor_details,contractor_active); $$;

create function app_private.link_contractor_access(target_id uuid,target_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor public.users%rowtype; person public.cleaners%rowtype; account public.users%rowtype;
begin
 select * into actor from public.users where id=auth.uid() and active;
 select * into person from public.cleaners where id=target_id for update;
 select * into account from public.users where id=target_user for update;
 if actor.id is null or actor.role not in ('owner','admin') or person.id is null or account.id is null
  or person.owner_id<>actor.owner_id or account.owner_id<>actor.owner_id or account.role<>'cleaner' or not account.active or person.role<>'cleaner' or not person.active then raise exception 'Choose an active contractor and cleaner account on your team.'; end if;
 if person.user_id=target_user then return; end if;
 if person.user_id is not null then raise exception 'This contractor already has app access.'; end if;
 -- The new login's empty, automatically-created payee is disposable. Any
 -- financial/job history prevents deletion through its ordinary FK constraints.
 perform 1 from public.cleaners where user_id=target_user and id<>target_id for update;
 if exists(select 1 from public.cleaners c where c.user_id=target_user and c.id<>target_id and
 (exists(select 1 from public.assignments a where a.cleaner_id=c.id) or exists(select 1 from public.properties p where p.default_cleaner_id=c.id)
 or exists(select 1 from public.recurring_tasks r where r.assignee_id=c.id) or exists(select 1 from public.payout_entries e where e.cleaner_id=c.id)
 or exists(select 1 from public.payout_batches b where b.cleaner_filter=c.id) or exists(select 1 from public.cleaner_accounts a where a.cleaner_id=c.id)
 or exists(select 1 from public.cleaner_payments p where p.cleaner_id=c.id))) then raise exception 'This login already has cleaning history. Use a different new account.'; end if;
 delete from public.cleaners where user_id=target_user and id<>target_id;
 update public.cleaners set user_id=target_user,email=account.email where id=target_id;
 update public.users set full_name=person.full_name,phone=person.phone,availability=person.availability,is_1099_contractor=person.is_1099_contractor where id=target_user;
 insert into public.audit_logs(owner_id,entity_type,entity_id,action,actor_user_id,metadata)
 values(actor.owner_id,'cleaner',target_id,'link_app_access',actor.id,jsonb_build_object('user_id',target_user));
end $$;
create function public.link_contractor_access(target_id uuid,target_user uuid) returns void language sql security invoker set search_path='' as $$ select app_private.link_contractor_access(target_id,target_user); $$;
revoke all on function app_private.save_contractor(uuid,text,text,text,text,boolean),public.save_contractor(uuid,text,text,text,text,boolean),app_private.link_contractor_access(uuid,uuid),public.link_contractor_access(uuid,uuid) from public,anon;
grant execute on function app_private.save_contractor(uuid,text,text,text,text,boolean),public.save_contractor(uuid,text,text,text,text,boolean),app_private.link_contractor_access(uuid,uuid),public.link_contractor_access(uuid,uuid) to authenticated;

create function app_private.manage_cleaner_state(target_id uuid,new_active boolean default null,new_1099 boolean default null,new_role text default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor public.users%rowtype; person public.cleaners%rowtype;
begin
 select * into actor from public.users where id=auth.uid() and active;
 select * into person from public.cleaners where id=target_id for update;
 if actor.id is null or actor.role not in ('owner','admin') or person.id is null or person.owner_id<>actor.owner_id or person.role='owner' then raise exception 'Choose a team member you can manage.'; end if;
 if new_role is not null and new_role not in ('cleaner','supervisor','admin') then raise exception 'Choose a valid team role.'; end if;
 if person.user_id is null then
  if new_role is not null and new_role<>'cleaner' then raise exception 'Invite this contractor to the app before changing their role.'; end if;
  update public.cleaners set active=coalesce(new_active,active),is_1099_contractor=coalesce(new_1099,is_1099_contractor) where id=target_id;
 else
  update public.users set active=coalesce(new_active,active),is_1099_contractor=coalesce(new_1099,is_1099_contractor),role=coalesce(new_role::public.user_role,role) where id=person.user_id and owner_id=actor.owner_id;
 end if;
end $$;
create function public.manage_cleaner_state(target_id uuid,new_active boolean default null,new_1099 boolean default null,new_role text default null)
returns void language sql security invoker set search_path='' as $$ select app_private.manage_cleaner_state(target_id,new_active,new_1099,new_role); $$;
revoke all on function app_private.manage_cleaner_state(uuid,boolean,boolean,text),public.manage_cleaner_state(uuid,boolean,boolean,text) from public,anon;
grant execute on function app_private.manage_cleaner_state(uuid,boolean,boolean,text),public.manage_cleaner_state(uuid,boolean,boolean,text) to authenticated;

-- Server-only rollback for a login proven newly created by the current signup/invite.
create function app_private.discard_unused_invited_cleaner(target_user uuid,expected_owner uuid)
returns void language plpgsql security definer set search_path='' as $$
declare person public.cleaners%rowtype;
begin
 if exists(select 1 from public.cleaners where user_id=target_user and id<>target_user) then raise exception 'This login is already linked to a contractor. Do not remove it.'; end if;
 select * into person from public.cleaners where id=target_user and user_id=target_user for update;
 if person.id is null then return; end if;
 if person.owner_id not in (target_user,expected_owner) then raise exception 'Cannot clean up a different workspace account.'; end if;
 if exists(select 1 from public.assignments where cleaner_id=person.id) or exists(select 1 from public.properties where default_cleaner_id=person.id)
 or exists(select 1 from public.recurring_tasks where assignee_id=person.id) or exists(select 1 from public.payout_entries where cleaner_id=person.id)
 or exists(select 1 from public.payout_batches where cleaner_filter=person.id) or exists(select 1 from public.cleaner_accounts where cleaner_id=person.id)
 or exists(select 1 from public.cleaner_payments where cleaner_id=person.id) then raise exception 'Cannot clean up an account with history.'; end if;
 delete from public.cleaners where id=person.id;
end $$;
create function public.discard_unused_invited_cleaner(target_user uuid,expected_owner uuid) returns void language sql security invoker set search_path='' as $$ select app_private.discard_unused_invited_cleaner(target_user,expected_owner); $$;
revoke all on function app_private.discard_unused_invited_cleaner(uuid,uuid),public.discard_unused_invited_cleaner(uuid,uuid) from public,anon,authenticated;
grant usage on schema app_private to service_role;
grant execute on function app_private.discard_unused_invited_cleaner(uuid,uuid),public.discard_unused_invited_cleaner(uuid,uuid) to service_role;
commit;
