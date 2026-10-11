begin;
create or replace function app_private.can_access_property(target_property_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
 select exists (
  select 1 from public.properties p
  where p.id=target_property_id
    and p.owner_id=app_private.current_owner_id()
    and (
      app_private.current_app_user_role() in ('owner','admin','supervisor')
      or (
       app_private.current_app_user_role()='cleaner'
       and exists (
        select 1 from public.assignments a
        where a.owner_id=p.owner_id and a.cleaner_id=auth.uid()
          and (a.property_id=p.id or coalesce(a.listing_property_id,a.property_id)=p.id)
       )
      )
    )
 );
$function$;
-- Readers need the configuration used by their own job as well as its operational root.
-- UPDATE/INSERT/DELETE remain tenant-admin only.
alter policy property_inventory_items_select_authorized on public.property_inventory_items
using (owner_id=(select public.current_owner_id()) and public.can_access_property(property_id));
commit;
