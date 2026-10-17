-- Batch recording delegates to the same authorized, audited owner completion.
create function app_private.complete_cleaning_batch(job_ids uuid[],target_cleaner uuid,audit_reason text,confirmed boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare actor public.users%rowtype; job_id uuid; changed integer:=0;
begin
 select * into actor from public.users where id=auth.uid() and active;
 if actor.id is null or actor.role not in ('owner','admin') then raise exception 'Only the host can record completed cleanings.'; end if;
 if coalesce(cardinality(job_ids),0) not between 1 and 1000 or array_position(job_ids,null) is not null then raise exception 'Select 1 to 1,000 cleanings.'; end if;
 for job_id in select distinct unnest(job_ids) order by 1 loop
  perform app_private.owner_manage_cleaning(job_id,'complete',target_cleaner,'{}',audit_reason,confirmed);
  changed:=changed+1;
 end loop;
 return changed;
end $$;
create function public.complete_cleaning_batch(job_ids uuid[],target_cleaner uuid,audit_reason text,confirmed boolean)
returns integer language sql security invoker set search_path='' as $$ select app_private.complete_cleaning_batch(job_ids,target_cleaner,audit_reason,confirmed); $$;
revoke all on function app_private.complete_cleaning_batch(uuid[],uuid,text,boolean),public.complete_cleaning_batch(uuid[],uuid,text,boolean) from public,anon;
grant execute on function app_private.complete_cleaning_batch(uuid[],uuid,text,boolean),public.complete_cleaning_batch(uuid[],uuid,text,boolean) to authenticated;
