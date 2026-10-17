-- Restore the original identity, never copy a job or mark unpaid work completed.
create function app_private.restore_cancelled_cleaning(target_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.users%rowtype; job public.assignments%rowtype; zone text;
begin
 select * into actor from public.users where id=auth.uid() and active;
 if actor.id is null or actor.role not in ('owner','admin') then raise exception 'Only the host can restore cleanings.'; end if;
 select * into job from public.assignments where id=target_id and owner_id=actor.owner_id for update;
 if job.id is null then raise exception 'Cleaning not found.'; end if;
 if job.status <> 'cancelled' then raise exception 'This cleaning is no longer cancelled. Refresh the page.'; end if;
 perform public.assert_job_pay_editable(job.id);
 -- Serialize restores for the same physical unit; reject obsolete feed duplicates.
 select coalesce(timezone,'America/New_York') into zone from public.properties where id=job.property_id for update;
 if exists(select 1 from public.assignments a where a.owner_id=job.owner_id and a.property_id=job.property_id and a.id<>job.id and a.status<>'cancelled'
 and (coalesce(a.checkout_at,a.due_at) at time zone zone)::date=(coalesce(job.checkout_at,job.due_at) at time zone zone)::date) then
 raise exception 'A cleaning already exists for this unit and checkout date. Manage that job instead.'; end if;
 update public.assignments set status='unassigned',cleaner_id=null,ack_status='pending',accepted_at=null where id=job.id;
 insert into public.assignment_events(assignment_id,event_type,actor_user_id,payload) values(job.id,'owner_restore',actor.id,jsonb_build_object('before_status','cancelled','after_status','unassigned','before_cleaner',job.cleaner_id));
 insert into public.audit_logs(owner_id,entity_type,entity_id,action,actor_user_id,metadata) values(actor.owner_id,'assignment',job.id,'owner_restore',actor.id,jsonb_build_object('before',to_jsonb(job),'reason','Host restored accidentally cancelled cleaning; choose a cleaner again.'));
 return job.id;
end $$;
revoke all on function app_private.restore_cancelled_cleaning(uuid) from public,anon;
grant execute on function app_private.restore_cancelled_cleaning(uuid) to authenticated;
create function public.restore_cancelled_cleaning(target_id uuid) returns uuid language sql security invoker set search_path='' as $$ select app_private.restore_cancelled_cleaning(target_id); $$;
revoke all on function public.restore_cancelled_cleaning(uuid) from public,anon;
grant execute on function public.restore_cancelled_cleaning(uuid) to authenticated;
