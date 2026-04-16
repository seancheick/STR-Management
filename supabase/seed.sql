-- Seed data expects auth users to exist first.
-- Create users in Supabase Auth, then run this file to add a baseline property,
-- checklist template, and assignment for local testing.

with owner_user as (
  select id from public.users where role = 'owner' order by created_at asc limit 1
),
cleaner_user as (
  select id from public.users where role = 'cleaner' order by created_at asc limit 1
),
template_insert as (
  insert into public.checklist_templates (owner_id, name, template_type, is_default)
  select id, 'Default Turnover', 'custom', true
  from owner_user
  where not exists (
    select 1 from public.checklist_templates where name = 'Default Turnover'
  )
  returning id, owner_id
),
template_target as (
  select id, owner_id from template_insert
  union all
  select id, owner_id
  from public.checklist_templates
  where name = 'Default Turnover'
  limit 1
),
property_insert as (
  insert into public.properties (
    owner_id,
    name,
    address_line_1,
    city,
    state,
    postal_code,
    bedrooms,
    bathrooms,
    timezone,
    primary_checklist_template_id
  )
  select
    template_target.owner_id,
    'Lakeview Loft',
    '123 Demo Street',
    'Austin',
    'TX',
    '78701',
    2,
    2,
    'America/Chicago',
    template_target.id
  from template_target
  where not exists (
    select 1 from public.properties where name = 'Lakeview Loft'
  )
  returning id, owner_id, primary_checklist_template_id
),
property_target as (
  select id, owner_id, primary_checklist_template_id from property_insert
  union all
  select id, owner_id, primary_checklist_template_id
  from public.properties
  where name = 'Lakeview Loft'
  limit 1
),
item_insert as (
  insert into public.checklist_template_items (
    template_id,
    section_name,
    label,
    required,
    sort_order,
    photo_category
  )
  select primary_checklist_template_id, 'Kitchen', 'Counters wiped', true, 10, 'kitchen'
  from property_target
  where not exists (
    select 1
    from public.checklist_template_items
    where template_id = property_target.primary_checklist_template_id
      and label = 'Counters wiped'
  )
)
insert into public.assignments (
  owner_id,
  property_id,
  cleaner_id,
  status,
  ack_status,
  due_at,
  created_by_user_id
)
select
  property_target.owner_id,
  property_target.id,
  cleaner_user.id,
  'assigned',
  'pending',
  timezone('utc', now()) + interval '1 day',
  property_target.owner_id
from property_target
cross join cleaner_user
where not exists (
  select 1
  from public.assignments
  where property_id = property_target.id
    and due_at::date = (timezone('utc', now()) + interval '1 day')::date
);
