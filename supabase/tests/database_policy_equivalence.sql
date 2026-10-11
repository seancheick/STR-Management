-- Inventory SELECT now has intentional listing-access changes tested by cleaner_listing_property_access.sql.
-- Read-only equivalence assertions for the policy consolidation, across every existing active user.
begin;
do $test$
declare caller record; target record; new_expression text; mismatch boolean;
begin
for caller in select id from public.users where active loop
perform set_config('request.jwt.claim.sub',caller.id::text,true);
for target in select * from (values
('issue_media','SELECT','qual','((issue_id IN ( SELECT issues.id
   FROM issues
  WHERE ((current_app_user_role() = ''cleaner''::user_role) AND ((issues.reported_by_id = auth.uid()) OR (issues.assignment_id IN ( SELECT assignments.id
           FROM assignments
          WHERE (assignments.cleaner_id = auth.uid())))))))) or ((EXISTS ( SELECT 1
   FROM issues i
  WHERE ((i.id = issue_media.issue_id) AND (i.owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))))'),
('issue_media','INSERT','with_check','(((uploaded_by_id = auth.uid()) AND (current_app_user_role() = ''cleaner''::user_role))) or ((EXISTS ( SELECT 1
   FROM issues i
  WHERE ((i.id = issue_media.issue_id) AND (i.owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))))'),
('issue_media','UPDATE','qual','((EXISTS ( SELECT 1
   FROM issues i
  WHERE ((i.id = issue_media.issue_id) AND (i.owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))))'),
('issue_media','UPDATE','with_check','((EXISTS ( SELECT 1
   FROM issues i
  WHERE ((i.id = issue_media.issue_id) AND (i.owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))))'),
('issue_media','DELETE','qual','((EXISTS ( SELECT 1
   FROM issues i
  WHERE ((i.id = issue_media.issue_id) AND (i.owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))))'),
('issues','SELECT','qual','(((current_app_user_role() = ''cleaner''::user_role) AND ((reported_by_id = auth.uid()) OR (assignment_id IN ( SELECT assignments.id
   FROM assignments
  WHERE (assignments.cleaner_id = auth.uid())))))) or (((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('issues','INSERT','with_check','(((current_app_user_role() = ''cleaner''::user_role) AND (reported_by_id = auth.uid()))) or (((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('issues','UPDATE','qual','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('issues','UPDATE','with_check','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('issues','DELETE','qual','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('notifications','SELECT','qual','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role])))) or ((recipient_id = auth.uid()))'),
('payout_entries','SELECT','qual','(((current_app_user_role() = ''cleaner''::user_role) AND (cleaner_id = auth.uid()) AND (batch_id IN ( SELECT payout_batches.id
   FROM payout_batches
  WHERE (payout_batches.status = ANY (ARRAY[''approved''::payout_batch_status, ''paid''::payout_batch_status])))))) or (((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('payout_entries','INSERT','with_check','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('payout_entries','UPDATE','qual','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('payout_entries','UPDATE','with_check','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('payout_entries','DELETE','qual','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('properties','SELECT','qual','(can_access_property(id)) or (((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('properties','INSERT','with_check','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('properties','UPDATE','qual','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('properties','UPDATE','with_check','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('properties','DELETE','qual','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('restock_requests','SELECT','qual','(((current_app_user_role() = ''cleaner''::user_role) AND (requested_by_id = auth.uid()))) or (((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('restock_requests','INSERT','with_check','(((current_app_user_role() = ''cleaner''::user_role) AND (requested_by_id = auth.uid()))) or (((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('restock_requests','UPDATE','qual','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('restock_requests','UPDATE','with_check','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))'),
('restock_requests','DELETE','qual','(((owner_id = current_owner_id()) AND (current_app_user_role() = ANY (ARRAY[''owner''::user_role, ''admin''::user_role, ''supervisor''::user_role]))))')
) as specs(table_name,command,field,original_expression) loop
select case when target.field='qual' then qual else with_check end into new_expression from pg_policies where schemaname='public' and tablename=target.table_name and cmd=target.command;
if new_expression is null then raise exception 'Missing consolidated policy %.%',target.table_name,target.command; end if;
execute format('select exists(select 1 from public.%I where ((%s) is true) is distinct from ((%s) is true))',target.table_name,target.original_expression,new_expression) into mismatch;
if mismatch then raise exception 'Policy equivalence failed %.% for caller %',target.table_name,target.command,caller.id; end if;
end loop;
end loop;
end $test$;
select 'policy union equivalence passed for every active user across existing rows' as result;
rollback;
