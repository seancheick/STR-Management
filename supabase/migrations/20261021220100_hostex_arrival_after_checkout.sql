begin;
create or replace function public.apply_hostex_job_change(target_id uuid, tenant uuid, change_kind text, patch jsonb) returns boolean
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
 if job.status not in ('unassigned','assigned','confirmed') then return false; end if;
 -- Arrival context can change after checkout. This does not authorize moving
 -- or cancelling the cleaning, nor change pay, scope, completion or evidence.
 if change_kind='arrival' then
   update public.assignments set next_checkin_at=(patch->>'next_checkin_at')::timestamptz where id=job.id;
   return true;
 end if;
 if coalesce(job.checkout_at,job.due_at)<=now() then return false; end if;
 if change_kind='move' then
   if (patch->>'checkout_at')::timestamptz<=now() or (patch->>'due_at')::timestamptz<=now() then return false; end if;
   update public.assignments set checkout_at=(patch->>'checkout_at')::timestamptz,due_at=(patch->>'due_at')::timestamptz,next_checkin_at=(patch->>'next_checkin_at')::timestamptz where id=job.id;

 elsif change_kind='cancel' then
   update public.assignments set status='cancelled',reservation_cancelled_at=now() where id=job.id;
 else raise exception 'Unknown Hostex change.';
 end if;
 return true;
end $$;

commit;
