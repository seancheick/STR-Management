begin;
alter table public.assignments add column hostex_stay_code text;
-- The booking code can contain multiple stays; only stay_code owns a turnover.
create index assignments_hostex_stay on public.assignments(owner_id,hostex_stay_code) where hostex_stay_code is not null;

create function app_private.hostex_job_locked(target_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select a.paid_at is not null or a.ledger_entry_id is not null
 or exists(select 1 from public.payout_entries e where e.assignment_id=a.id)
 or exists(select 1 from public.cleaning_pay_adjustments p where p.assignment_id=a.id)
 or exists(select 1 from public.cleaner_accounts c join public.properties p on p.id=a.property_id
   where c.owner_id=a.owner_id and c.cleaner_id=a.cleaner_id
   and (coalesce(a.checkout_at,a.due_at) at time zone coalesce(p.timezone,'America/New_York'))::date<=c.reconciled_through)
 from public.assignments a where a.id=target_id;
$$;

-- Service-only mutations recheck status, financial locks, checkout and identity
-- under the job lock, rather than trusting an earlier planner snapshot.
create function public.apply_hostex_job_change(target_id uuid, tenant uuid, change_kind text, patch jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare job public.assignments%rowtype; person uuid;
begin
 select cleaner_id into person from public.assignments where id=target_id and owner_id=tenant;
 if person is not null then perform 1 from public.cleaners where id=person for update; end if;
 select * into job from public.assignments where id=target_id and owner_id=tenant for update;
 if not found then return false; end if;
 if job.cleaner_id is distinct from person then return false; end if;
 if job.source_type not in ('ical','hostex') or app_private.hostex_job_locked(job.id) then return false; end if;
 if patch ? 'expected_code' and job.hostex_reservation_code is distinct from patch->>'expected_code' then return false; end if;
 if patch ? 'expected_stay_code' and job.hostex_stay_code is distinct from patch->>'expected_stay_code' then return false; end if;
 if patch ? 'expected_checkout_at' and job.checkout_at is distinct from (patch->>'expected_checkout_at')::timestamptz then return false; end if;
 if change_kind='link' then
   update public.assignments set hostex_reservation_code=patch->>'hostex_reservation_code',hostex_stay_code=patch->>'hostex_stay_code',booking_channel=patch->>'booking_channel' where id=job.id;
   return true;
 end if;
 if job.status not in ('unassigned','assigned','confirmed') or coalesce(job.checkout_at,job.due_at)<=now() then return false; end if;
 if change_kind='move' then
   if (patch->>'checkout_at')::timestamptz<=now() or (patch->>'due_at')::timestamptz<=now() then return false; end if;
   update public.assignments set checkout_at=(patch->>'checkout_at')::timestamptz,due_at=(patch->>'due_at')::timestamptz,next_checkin_at=(patch->>'next_checkin_at')::timestamptz where id=job.id;
 elsif change_kind='arrival' then
   update public.assignments set next_checkin_at=(patch->>'next_checkin_at')::timestamptz where id=job.id;
 elsif change_kind='cancel' then
   update public.assignments set status='cancelled',reservation_cancelled_at=now() where id=job.id;
 else raise exception 'Unknown Hostex change.';
 end if;
 return true;
end $$;

-- A failed issue insert rolls the marker back, so the following run retries it.
create function public.flag_hostex_cleaning(target_id uuid, tenant uuid, issue_title text, issue_description text, expectations jsonb default '{}'::jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare job public.assignments%rowtype;
begin
 select * into job from public.assignments where id=target_id and owner_id=tenant for update;
 if not found or job.reservation_cancelled_at is not null then return false; end if;
 if expectations ? 'expected_code' and job.hostex_reservation_code is distinct from expectations->>'expected_code' then return false; end if;
 if expectations ? 'expected_stay_code' and job.hostex_stay_code is distinct from expectations->>'expected_stay_code' then return false; end if;
 if expectations ? 'expected_checkout_at' and job.checkout_at is distinct from (expectations->>'expected_checkout_at')::timestamptz then return false; end if;
 update public.assignments set reservation_cancelled_at=now() where id=job.id;
 insert into public.issues(owner_id,assignment_id,property_id,issue_type,severity,title,description)
 values(tenant,job.id,job.property_id,'other','high',issue_title,issue_description);
 return true;
end $$;

create function public.create_hostex_cleaning(payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare tenant uuid:=(payload->>'owner_id')::uuid; unit public.properties%rowtype; listing public.properties%rowtype;
 job public.assignments%rowtype; person public.cleaners%rowtype; target_id uuid; ref text; zone text;
 checkout_time timestamptz:=(payload->>'checkout_at')::timestamptz; deadline timestamptz:=(payload->>'due_at')::timestamptz;
 local_day date; new_status public.assignment_status; no_access boolean:=false; revived boolean:=false;
begin
 select * into unit from public.properties where id=(payload->>'property_id')::uuid and owner_id=tenant and active;
 if not found then raise exception 'Hostex unit is not owned by this tenant.'; end if;
 select * into listing from public.properties where id=(payload->>'listing_property_id')::uuid and owner_id=tenant and active
   and coalesce(physical_unit_id,id)=unit.id;
 if not found then raise exception 'Hostex listing is not mapped to this unit.'; end if;
 if nullif(payload->>'hostex_stay_code','') is null or nullif(payload->>'hostex_reservation_code','') is null then raise exception 'Hostex stay identity is required.'; end if;
 zone:=coalesce(unit.timezone,'America/New_York'); local_day:=(checkout_time at time zone zone)::date;
 -- Serialize imports of a physical turnover, including competing Hostex runs.
 perform pg_advisory_xact_lock(hashtextextended(tenant::text||':'||unit.id::text||':'||local_day::text,0));
 select * into job from public.assignments where owner_id=tenant and property_id=unit.id and assignment_type='cleaning' and status<>'cancelled'
   and (coalesce(checkout_at,due_at) at time zone zone)::date=local_day order by created_at,id limit 1;
 if found then return jsonb_build_object('id',job.id,'created',false,'revived',false); end if;
 if deadline<=now() then raise exception 'Hostex cleaning deadline has already passed.'; end if;
 if exists(select 1 from public.cleaner_accounts c where c.owner_id=tenant and local_day<=c.reconciled_through) then raise exception 'Hostex checkout falls in reconciled history.'; end if;
 if unit.default_cleaner_id is not null then
   select * into person from public.cleaners where id=unit.default_cleaner_id and owner_id=tenant and role='cleaner' and active for update;
 end if;
 no_access:=person.id is not null and person.user_id is null;
 new_status:=case when person.id is null then 'unassigned'::public.assignment_status when no_access then 'confirmed'::public.assignment_status else 'assigned'::public.assignment_status end;
 -- Date-specific assignment references preserve a started old checkout while a
 -- changed stay creates its new turnover. Reservation references remain stable.
 ref:='hostex:'||(payload->>'hostex_stay_code')||':checkout:'||local_day::text;
 select * into job from public.assignments where owner_id=tenant and property_id=unit.id and (source_reference=ref or
   (source_reference='hostex:'||(payload->>'hostex_stay_code') and (coalesce(checkout_at,due_at) at time zone zone)::date=local_day))
   order by case when source_reference=ref then 0 else 1 end limit 1 for update;
 if found then
   if job.status<>'cancelled' or job.source_type<>'hostex' or job.started_at is not null or job.completed_at is not null
     or job.reservation_cancelled_at is null or app_private.hostex_job_locked(job.id) then raise exception 'Existing Hostex turnover cannot be restored automatically.'; end if;
   target_id:=job.id; revived:=true;
   -- Restore the original assignee and acknowledgement, including a deliberate
   -- unassigned job, rather than silently adopting today's default cleaner.
   person:=null;
   if job.cleaner_id is not null then
     select * into person from public.cleaners where id=job.cleaner_id and owner_id=tenant and role='cleaner' and active;
   end if;
   new_status:=case when person.id is null then 'unassigned'::public.assignment_status
     when job.ack_status='accepted' then 'confirmed'::public.assignment_status else 'assigned'::public.assignment_status end;
   update public.assignments set status=new_status,cleaner_id=person.id,ack_status=case when person.id is not null then job.ack_status else 'pending'::public.assignment_ack_status end,
     accepted_at=case when person.id is not null then job.accepted_at else null end,reservation_cancelled_at=null,checkout_at=checkout_time,due_at=deadline,
     next_checkin_at=(payload->>'next_checkin_at')::timestamptz,hostex_reservation_code=payload->>'hostex_reservation_code',hostex_stay_code=payload->>'hostex_stay_code',booking_channel=payload->>'booking_channel'
     where id=target_id;
 else
   insert into public.assignments(owner_id,property_id,listing_property_id,booking_channel,cleaner_id,assignment_type,fixed_payout_amount,status,ack_status,accepted_at,
      priority,checkout_at,due_at,next_checkin_at,source_type,source_reference,hostex_reservation_code,hostex_stay_code,created_by_user_id)
   values(tenant,unit.id,listing.id,payload->>'booking_channel',person.id,'cleaning',listing.default_clean_price,new_status,
     case when no_access then 'accepted'::public.assignment_ack_status else 'pending'::public.assignment_ack_status end,case when no_access then now() else null end,
     'normal',checkout_time,deadline,(payload->>'next_checkin_at')::timestamptz,'hostex',ref,payload->>'hostex_reservation_code',payload->>'hostex_stay_code',tenant)
   returning id into target_id;
 end if;
 -- Checklist snapshot and job are one transaction. A transient checklist failure
 -- rolls creation back, and retrying never strands an empty assignment.
 if not exists(select 1 from public.assignment_checklist_items where assignment_id=target_id) then
   insert into public.assignment_checklist_items(assignment_id,template_item_id,section_name,label,instruction_text,reference_media_url,required,photo_category,sort_order)
   select target_id,i.id,i.section_name,i.label,i.instruction_text,i.reference_media_url,i.required,i.photo_category,i.sort_order
   from public.checklist_template_items i join public.checklist_templates t on t.id=i.template_id
   where i.template_id=listing.primary_checklist_template_id and t.owner_id=tenant order by i.sort_order;
 end if;
 return jsonb_build_object('id',target_id,'created',not revived,'revived',revived);
end $$;
revoke all on function app_private.hostex_job_locked(uuid),public.apply_hostex_job_change(uuid,uuid,text,jsonb),public.flag_hostex_cleaning(uuid,uuid,text,text,jsonb),public.create_hostex_cleaning(jsonb) from public,anon,authenticated;
grant execute on function app_private.hostex_job_locked(uuid),public.apply_hostex_job_change(uuid,uuid,text,jsonb),public.flag_hostex_cleaning(uuid,uuid,text,text,jsonb),public.create_hostex_cleaning(jsonb) to service_role;
commit;
