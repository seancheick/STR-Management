-- Match existing app_private RLS helper architecture: exposed RPCs are invokers.
begin;
alter function public.add_assignment_extra(uuid,uuid,text,numeric,text) set schema app_private;
alter function public.remove_assignment_extra(uuid,uuid) set schema app_private;
alter function public.owner_manage_cleaning(uuid,text,uuid,jsonb,text,boolean) set schema app_private;
alter function public.assign_cleaning_batch_mode(uuid[],uuid,text) set schema app_private;
create function public.add_assignment_extra(target_id uuid, extra_id uuid, extra_description text, extra_amount numeric, extra_kind text)
returns void language sql security invoker set search_path='' as $$ select app_private.add_assignment_extra(target_id,extra_id,extra_description,extra_amount,extra_kind); $$;
create function public.remove_assignment_extra(target_id uuid, extra_id uuid)
returns void language sql security invoker set search_path='' as $$ select app_private.remove_assignment_extra(target_id,extra_id); $$;
create function public.owner_manage_cleaning(target_id uuid, operation text, target_cleaner uuid default null, assignment_patch jsonb default '{}'::jsonb, audit_reason text default null, confirmed boolean default false)
returns uuid language sql security invoker set search_path='' as $$ select app_private.owner_manage_cleaning(target_id,operation,target_cleaner,assignment_patch,audit_reason,confirmed); $$;
create function public.assign_cleaning_batch_mode(job_ids uuid[],target_cleaner uuid,assignment_mode text)
returns table(id uuid) language sql security invoker set search_path='' as $$ select * from app_private.assign_cleaning_batch_mode(job_ids,target_cleaner,assignment_mode); $$;
revoke all on function public.add_assignment_extra(uuid,uuid,text,numeric,text),public.remove_assignment_extra(uuid,uuid),public.owner_manage_cleaning(uuid,text,uuid,jsonb,text,boolean),public.assign_cleaning_batch_mode(uuid[],uuid,text) from public,anon;
grant execute on function public.add_assignment_extra(uuid,uuid,text,numeric,text),public.remove_assignment_extra(uuid,uuid),public.owner_manage_cleaning(uuid,text,uuid,jsonb,text,boolean),public.assign_cleaning_batch_mode(uuid[],uuid,text) to authenticated;
revoke all on function app_private.add_assignment_extra(uuid,uuid,text,numeric,text),app_private.remove_assignment_extra(uuid,uuid),app_private.owner_manage_cleaning(uuid,text,uuid,jsonb,text,boolean),app_private.assign_cleaning_batch_mode(uuid[],uuid,text) from public,anon;
grant execute on function app_private.add_assignment_extra(uuid,uuid,text,numeric,text),app_private.remove_assignment_extra(uuid,uuid),app_private.owner_manage_cleaning(uuid,text,uuid,jsonb,text,boolean),app_private.assign_cleaning_batch_mode(uuid[],uuid,text) to authenticated;
commit;
