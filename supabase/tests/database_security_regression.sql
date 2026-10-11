-- Run: supabase db query --linked --file supabase/tests/database_security_regression.sql
-- Integration assertions use existing active users and temporary fixture rows only.
-- No fixture or business-data writes survive the final ROLLBACK.
begin;
create temporary table security_fixture (owner_id uuid, other_owner_id uuid, cleaner_id uuid, property_id uuid, item_id uuid, batch_id uuid);
insert into security_fixture
select o.id, (select id from public.users where role='owner' and id<>o.id limit 1),
(select id from public.users where role='cleaner' and active and owner_id=o.id limit 1),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
from public.users o where o.role='owner' and o.active and exists(select 1 from public.users c where c.role='cleaner' and c.active and c.owner_id=o.id) limit 1;
do $$ begin if not exists(select 1 from security_fixture where other_owner_id is not null and cleaner_id is not null) then raise exception 'Requires two owner tenants and one active cleaner'; end if; end $$;
-- Activate the isolated second owner for the cross-tenant check; rollback restores it.
update public.users set active=true where id=(select other_owner_id from security_fixture);
grant select on security_fixture to authenticated, anon;
insert into public.properties(id,owner_id,name) select property_id,owner_id,'security regression fixture' from security_fixture;
insert into public.property_inventory_items(id,owner_id,property_id,name,current_quantity) select item_id,owner_id,property_id,'security regression fixture',1 from security_fixture;
insert into public.payout_batches(id,owner_id,label,period_start,period_end,total_amount) select batch_id,owner_id,'security regression fixture',current_date,current_date,999 from security_fixture;
select set_config('request.jwt.claim.sub',(select owner_id::text from security_fixture),true);
set local role authenticated;
do $$ begin
 if public.current_owner_id() is distinct from (select owner_id from security_fixture) then raise exception 'Owner helper failed'; end if;
 if not public.is_tenant_admin((select owner_id from security_fixture)) then raise exception 'Owner role helper failed'; end if;
 if public.is_tenant_admin((select other_owner_id from security_fixture)) then raise exception 'Cross-tenant helper allowed'; end if;
 if not public.can_access_property((select property_id from security_fixture)) then raise exception 'Property helper failed'; end if;
 perform public.increment_inventory_quantity((select item_id from security_fixture),1);
 if (select current_quantity from public.property_inventory_items where id=(select item_id from security_fixture)) <> 2 then raise exception 'Owner inventory update failed'; end if;
 perform public.recalculate_payout_batch((select batch_id from security_fixture));
 if (select total_amount from public.payout_batches where id=(select batch_id from security_fixture)) <> 0 then raise exception 'Owner payout update failed'; end if;
 if not exists(select 1 from public.v_low_inventory where id=(select item_id from security_fixture)) then raise exception 'Owner view failed'; end if;
 perform count(*) from public.v_exception_counts;
 perform count(*) from public.v_pending_recleans;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select other_owner_id::text from security_fixture),true);
set local role authenticated;
do $$ begin
 perform public.increment_inventory_quantity((select item_id from security_fixture),99);
 perform public.recalculate_payout_batch((select batch_id from security_fixture));
 if exists(select 1 from public.v_low_inventory where id=(select item_id from security_fixture)) then raise exception 'Cross-tenant view leak'; end if;
 if public.can_access_property((select property_id from security_fixture)) then raise exception 'Cross-tenant property helper leak'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select cleaner_id::text from security_fixture),true);
set local role authenticated;
do $$ begin
 perform public.increment_inventory_quantity((select item_id from security_fixture),99);
 perform public.recalculate_payout_batch((select batch_id from security_fixture));
 if public.is_admin_role() then raise exception 'Cleaner admin escalation'; end if;
 if public.can_access_assignment(gen_random_uuid()) then raise exception 'Unknown assignment allowed'; end if;
end $$;
reset role;
do $$ begin
 if (select current_quantity from public.property_inventory_items where id=(select item_id from security_fixture))<>2 then raise exception 'Unauthorized inventory update'; end if;
 if (select total_amount from public.payout_batches where id=(select batch_id from security_fixture))<>0 then raise exception 'Unauthorized payout update'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prorettype in ('trigger'::regtype,'event_trigger'::regtype) and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE'))) then raise exception 'Trigger callable by API roles'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin perform public.increment_inventory_quantity((select item_id from security_fixture),99); raise exception 'Anonymous RPC allowed'; exception when insufficient_privilege then null; end;
 begin perform public.recalculate_payout_batch((select batch_id from security_fixture)); raise exception 'Anonymous payout RPC allowed'; exception when insufficient_privilege then null; end;
 begin perform public.current_owner_id(); raise exception 'Anonymous helper allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'database security role regression passed; all fixture changes rolled back' as result;
rollback;
