begin;
alter function public.decline_cleaning_job(uuid,text) set schema app_private;
create function public.decline_cleaning_job(target_id uuid, decline_reason text)
returns void language sql security invoker set search_path='' as $$ select app_private.decline_cleaning_job(target_id,decline_reason); $$;
revoke all on function public.decline_cleaning_job(uuid,text),app_private.decline_cleaning_job(uuid,text) from public,anon;
grant execute on function public.decline_cleaning_job(uuid,text),app_private.decline_cleaning_job(uuid,text) to authenticated;
commit;
