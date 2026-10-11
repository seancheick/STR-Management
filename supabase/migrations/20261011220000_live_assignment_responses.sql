-- A decline must clear assignment and record its reason in the same transaction.
-- RLS normally removes cleaner access as soon as cleaner_id becomes NULL.
create or replace function public.decline_cleaning_job(target_id uuid, decline_reason text)
returns void language plpgsql security definer set search_path = '' as $$
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
  if job.id is null or job.cleaner_id is distinct from responder.id
    or job.owner_id is distinct from responder.owner_id
    or job.status not in ('assigned', 'confirmed') then
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
$$;
revoke all on function public.decline_cleaning_job(uuid,text) from public, anon;
grant execute on function public.decline_cleaning_job(uuid,text) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['assignments','notifications'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

-- Save the assignment and its inbox offer together, even if push is unavailable.
create or replace function public.assign_cleaning_batch(job_ids uuid[], target_cleaner uuid)
returns table(id uuid) language plpgsql security definer set search_path = '' as $$
declare
  actor public.users%rowtype;
  job_id uuid;
begin
  select * into actor from public.users where users.id = auth.uid() and active;
  if actor.id is null or actor.role not in ('owner','admin') then raise exception 'Only the host can assign cleanings.'; end if;
  if coalesce(array_length(job_ids,1),0) not between 1 and 1000 then raise exception 'Select 1 to 1,000 cleanings.'; end if;
  if not exists(select 1 from public.users where users.id = target_cleaner and owner_id = actor.owner_id and role = 'cleaner' and active) then
    raise exception 'Choose an active cleaner from your team.';
  end if;
  for job_id in
    update public.assignments a set cleaner_id = target_cleaner, status = 'assigned', ack_status = 'pending', accepted_at = null
    where a.id = any(job_ids) and a.owner_id = actor.owner_id and a.status = 'unassigned' and a.cleaner_id is null
    returning a.id
  loop
    insert into public.notifications(owner_id, recipient_id, assignment_id, channel, status, notification_type, title, body)
    values(actor.owner_id, target_cleaner, job_id, 'push','pending','new_assignment','New cleaning assignment',
      'Review the listing, date and cleaning window, then accept or decline.');
    id := job_id;
    return next;
  end loop;
end;
$$;
revoke all on function public.assign_cleaning_batch(uuid[],uuid) from public, anon;
grant execute on function public.assign_cleaning_batch(uuid[],uuid) to authenticated;
