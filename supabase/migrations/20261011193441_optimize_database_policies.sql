-- Cache request identity per statement and merge overlapping permissive policies.

-- OR predicates preserve the original union of admin and cleaner access.

begin;

drop policy "issue_media_cleaner_select" on public."issue_media";

drop policy "issue_media_cleaner_insert" on public."issue_media";

drop policy "tenant admins manage issue_media" on public."issue_media";

create policy "issue_media_select_authorized" on public."issue_media" for SELECT to authenticated using (((issue_id IN ( SELECT issues.id
   FROM issues
  WHERE (((select public.current_app_user_role()) = 'cleaner'::user_role) AND ((issues.reported_by_id = (select auth.uid())) OR (issues.assignment_id IN ( SELECT assignments.id
           FROM assignments
          WHERE (assignments.cleaner_id = (select auth.uid()))))))))) or ((EXISTS ( SELECT 1
   FROM issues i
  WHERE ((i.id = issue_media.issue_id) AND (i.owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))))));

create policy "issue_media_insert_authorized" on public."issue_media" for INSERT to authenticated with check ((((uploaded_by_id = (select auth.uid())) AND ((select public.current_app_user_role()) = 'cleaner'::user_role))) or ((EXISTS ( SELECT 1
   FROM issues i
  WHERE ((i.id = issue_media.issue_id) AND (i.owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))))));

create policy "issue_media_update_authorized" on public."issue_media" for UPDATE to authenticated using (((EXISTS ( SELECT 1
   FROM issues i
  WHERE ((i.id = issue_media.issue_id) AND (i.owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role]))))))) with check (((EXISTS ( SELECT 1
   FROM issues i
  WHERE ((i.id = issue_media.issue_id) AND (i.owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))))));

create policy "issue_media_delete_authorized" on public."issue_media" for DELETE to authenticated using (((EXISTS ( SELECT 1
   FROM issues i
  WHERE ((i.id = issue_media.issue_id) AND (i.owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))))));

drop policy "issues_cleaner_select" on public."issues";

drop policy "issues_cleaner_insert" on public."issues";

drop policy "tenant admins manage issues" on public."issues";

create policy "issues_select_authorized" on public."issues" for SELECT to authenticated using (((((select public.current_app_user_role()) = 'cleaner'::user_role) AND ((reported_by_id = (select auth.uid())) OR (assignment_id IN ( SELECT assignments.id
   FROM assignments
  WHERE (assignments.cleaner_id = (select auth.uid()))))))) or (((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "issues_insert_authorized" on public."issues" for INSERT to authenticated with check (((((select public.current_app_user_role()) = 'cleaner'::user_role) AND (reported_by_id = (select auth.uid())))) or (((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "issues_update_authorized" on public."issues" for UPDATE to authenticated using ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role]))))) with check ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "issues_delete_authorized" on public."issues" for DELETE to authenticated using ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

drop policy "tenant admins read notifications" on public."notifications";

drop policy "recipient reads own notifications" on public."notifications";

create policy "notifications_select_authorized" on public."notifications" for SELECT to authenticated using ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))) or ((recipient_id = (select auth.uid()))));

drop policy "payout_entries_cleaner_read" on public."payout_entries";

drop policy "tenant admins manage payout_entries" on public."payout_entries";

create policy "payout_entries_select_authorized" on public."payout_entries" for SELECT to authenticated using (((((select public.current_app_user_role()) = 'cleaner'::user_role) AND (cleaner_id = (select auth.uid())) AND (batch_id IN ( SELECT payout_batches.id
   FROM payout_batches
  WHERE (payout_batches.status = ANY (ARRAY['approved'::payout_batch_status, 'paid'::payout_batch_status])))))) or (((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "payout_entries_insert_authorized" on public."payout_entries" for INSERT to authenticated with check ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "payout_entries_update_authorized" on public."payout_entries" for UPDATE to authenticated using ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role]))))) with check ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "payout_entries_delete_authorized" on public."payout_entries" for DELETE to authenticated using ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

drop policy "admins can read properties" on public."properties";

drop policy "tenant admins manage properties" on public."properties";

create policy "properties_select_authorized" on public."properties" for SELECT to authenticated using ((can_access_property(id)) or (((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "properties_insert_authorized" on public."properties" for INSERT to authenticated with check ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "properties_update_authorized" on public."properties" for UPDATE to authenticated using ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role]))))) with check ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "properties_delete_authorized" on public."properties" for DELETE to authenticated using ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

drop policy "inventory_cleaner_select" on public."property_inventory_items";

drop policy "tenant admins manage property_inventory_items" on public."property_inventory_items";

create policy "property_inventory_items_select_authorized" on public."property_inventory_items" for SELECT to authenticated using (((((select public.current_app_user_role()) = 'cleaner'::user_role) AND (property_id IN ( SELECT assignments.property_id
   FROM assignments
  WHERE (assignments.cleaner_id = (select auth.uid())))))) or (((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "property_inventory_items_insert_authorized" on public."property_inventory_items" for INSERT to authenticated with check ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "property_inventory_items_update_authorized" on public."property_inventory_items" for UPDATE to authenticated using ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role]))))) with check ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "property_inventory_items_delete_authorized" on public."property_inventory_items" for DELETE to authenticated using ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

drop policy "restock_cleaner_select" on public."restock_requests";

drop policy "restock_cleaner_insert" on public."restock_requests";

drop policy "tenant admins manage restock_requests" on public."restock_requests";

create policy "restock_requests_select_authorized" on public."restock_requests" for SELECT to authenticated using (((((select public.current_app_user_role()) = 'cleaner'::user_role) AND (requested_by_id = (select auth.uid())))) or (((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "restock_requests_insert_authorized" on public."restock_requests" for INSERT to authenticated with check (((((select public.current_app_user_role()) = 'cleaner'::user_role) AND (requested_by_id = (select auth.uid())))) or (((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "restock_requests_update_authorized" on public."restock_requests" for UPDATE to authenticated using ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role]))))) with check ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

create policy "restock_requests_delete_authorized" on public."restock_requests" for DELETE to authenticated using ((((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

alter policy "device_sub_own" on public."device_subscriptions" using ((user_id = (select auth.uid())));

alter policy "self or tenant-admin can read user" on public."users" using (((id = (select auth.uid())) OR ((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

alter policy "self or tenant-admin can update user" on public."users" using (((id = (select auth.uid())) OR ((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role]))))) with check (((id = (select auth.uid())) OR ((owner_id = (select public.current_owner_id())) AND ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

alter policy "cleaner_accounts_read" on public."cleaner_accounts" using (((owner_id = (select public.current_owner_id())) AND ((cleaner_id = (select auth.uid())) OR ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

alter policy "cleaner_ledger_read" on public."cleaner_ledger_entries" using (((owner_id = (select public.current_owner_id())) AND ((cleaner_id = (select auth.uid())) OR ((select public.current_app_user_role()) = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'supervisor'::user_role])))));

commit;
