-- Owner operations lock the cleaning and save status, inbox and audit atomically.
create or replace function app_private.owner_manage_cleaning(target_id uuid, operation text, target_cleaner uuid default null, assignment_patch jsonb default '{}'::jsonb, audit_reason text default null, confirmed boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
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
 if chosen is not null and not exists(select 1 from public.users where id=chosen and owner_id=actor.owner_id and role='cleaner' and active) then raise exception 'Choose an active cleaner from your team.'; end if;
 if operation in ('request','direct','complete') and chosen is null then raise exception 'Choose a cleaner first.'; end if;
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
   status=case when chosen is null then 'unassigned'::public.assignment_status when changed then 'assigned'::public.assignment_status else status end,
   ack_status=case when changed then 'pending'::public.assignment_ack_status else ack_status end,accepted_at=case when changed then null else accepted_at end
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
 if chosen is not null and (operation in ('request','direct','complete') or changed) then
  insert into public.notifications(owner_id,recipient_id,assignment_id,channel,status,notification_type,title,body)
  values(actor.owner_id,chosen,job.id,'push','pending',case when updated.status='approved' then 'owner_completed' else 'new_assignment' end,case when updated.status='approved' then 'Cleaning marked completed' when updated.status='confirmed' then 'Cleaning confirmed by host' else 'New cleaning request' end,
   case when updated.status='approved' then 'The host recorded this cleaning as completed and approved. No response is needed.' when updated.status='confirmed' then 'Added to your schedule by the host. No acceptance is needed.' else 'Review the cleaning and accept or decline.' end);
 end if;
 if changed and job.cleaner_id is not null then
  insert into public.notifications(owner_id,recipient_id,assignment_id,channel,status,notification_type,title,body)
  values(actor.owner_id,job.cleaner_id,job.id,'push','pending','assignment_removed','Cleaning removed from your schedule','The host reassigned or removed this cleaning. No response is needed.');
 end if;
 insert into public.assignment_events(assignment_id,event_type,actor_user_id,payload) values(job.id,'owner_'||operation,actor.id,jsonb_build_object('before_status',job.status,'after_status',updated.status,'reason',trim(audit_reason),'before_cleaner',job.cleaner_id,'after_cleaner',chosen));
 insert into public.audit_logs(owner_id,entity_type,entity_id,action,actor_user_id,metadata) values(actor.owner_id,'assignment',job.id,'owner_'||operation,actor.id,jsonb_build_object('reason',trim(audit_reason),'before',to_jsonb(job),'after',to_jsonb(updated)));
 return job.id;
end $$;
