-- Sprint 2: Exceptions
-- Tables: issues, issue_media, property_inventory_items, restock_requests
-- Adds needs_reclean trigger + linked assignment creation helper

-- ─── Enums ───────────────────────────────────────────────────────────────────

create type public.issue_type as enum (
  'cleaning',
  'maintenance',
  'damage',
  'inventory',
  'access',
  'other'
);

create type public.issue_severity as enum ('low', 'medium', 'high', 'critical');

create type public.issue_status as enum (
  'open',
  'acknowledged',
  'in_progress',
  'resolved',
  'closed'
);

-- ─── Issues ──────────────────────────────────────────────────────────────────

create table public.issues (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.users (id) on delete restrict,
  assignment_id       uuid references public.assignments (id) on delete set null,
  property_id         uuid not null references public.properties (id) on delete restrict,
  reported_by_id      uuid references public.users (id) on delete set null,
  issue_type          public.issue_type not null default 'other',
  severity            public.issue_severity not null default 'medium',
  status              public.issue_status not null default 'open',
  title               text not null,
  description         text,
  resolved_at         timestamptz,
  resolved_by_id      uuid references public.users (id) on delete set null,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now())
);

create index idx_issues_property_id    on public.issues (property_id);
create index idx_issues_assignment_id  on public.issues (assignment_id);
create index idx_issues_owner_id       on public.issues (owner_id);
create index idx_issues_status         on public.issues (status);

-- ─── Issue Media ─────────────────────────────────────────────────────────────

create table public.issue_media (
  id               uuid primary key default gen_random_uuid(),
  issue_id         uuid not null references public.issues (id) on delete cascade,
  storage_path     text not null,
  file_size_bytes  integer not null check (file_size_bytes <= 5242880),
  uploaded_by_id   uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default timezone('utc', now())
);

create index idx_issue_media_issue_id on public.issue_media (issue_id);

-- ─── Property Inventory Items ────────────────────────────────────────────────

create table public.property_inventory_items (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.users (id) on delete restrict,
  property_id        uuid not null references public.properties (id) on delete cascade,
  name               text not null,
  category           text,
  unit               text not null default 'unit',
  current_quantity   integer not null default 0 check (current_quantity >= 0),
  reorder_threshold  integer not null default 2 check (reorder_threshold >= 0),
  active             boolean not null default true,
  created_at         timestamptz not null default timezone('utc', now()),
  updated_at         timestamptz not null default timezone('utc', now())
);

create index idx_property_inventory_property_id on public.property_inventory_items (property_id);
create index idx_property_inventory_owner_id    on public.property_inventory_items (owner_id);

-- ─── Restock Requests ────────────────────────────────────────────────────────

create type public.restock_status as enum ('pending', 'acknowledged', 'fulfilled', 'cancelled');

create table public.restock_requests (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.users (id) on delete restrict,
  assignment_id  uuid references public.assignments (id) on delete set null,
  inventory_item_id uuid not null references public.property_inventory_items (id) on delete cascade,
  requested_by_id   uuid references public.users (id) on delete set null,
  quantity_needed   integer not null default 1 check (quantity_needed > 0),
  status            public.restock_status not null default 'pending',
  notes             text,
  fulfilled_at      timestamptz,
  fulfilled_by_id   uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default timezone('utc', now())
);

create index idx_restock_requests_inventory_item_id on public.restock_requests (inventory_item_id);
create index idx_restock_requests_assignment_id     on public.restock_requests (assignment_id);
create index idx_restock_requests_owner_id          on public.restock_requests (owner_id);
create index idx_restock_requests_status            on public.restock_requests (status);

-- ─── RLS: Issues ─────────────────────────────────────────────────────────────

alter table public.issues enable row level security;

-- Owner/admin/supervisor: full access to their org
create policy "issues_owner_all" on public.issues
  for all
  using (owner_id = auth.uid() or public.current_app_user_role() in ('admin', 'supervisor'));

-- Cleaner: see issues for assignments they own; insert for their own reports
create policy "issues_cleaner_select" on public.issues
  for select
  using (
    public.current_app_user_role() = 'cleaner'
    and (
      reported_by_id = auth.uid()
      or assignment_id in (
        select id from public.assignments where cleaner_id = auth.uid()
      )
    )
  );

create policy "issues_cleaner_insert" on public.issues
  for insert
  with check (
    public.current_app_user_role() = 'cleaner'
    and reported_by_id = auth.uid()
  );

-- ─── RLS: Issue Media ────────────────────────────────────────────────────────

alter table public.issue_media enable row level security;

create policy "issue_media_owner_all" on public.issue_media
  for all
  using (
    issue_id in (
      select id from public.issues
      where owner_id = auth.uid() or public.current_app_user_role() in ('admin', 'supervisor')
    )
  );

create policy "issue_media_cleaner_select" on public.issue_media
  for select
  using (
    issue_id in (
      select id from public.issues
      where public.current_app_user_role() = 'cleaner'
        and (reported_by_id = auth.uid() or assignment_id in (
          select id from public.assignments where cleaner_id = auth.uid()
        ))
    )
  );

create policy "issue_media_cleaner_insert" on public.issue_media
  for insert
  with check (
    uploaded_by_id = auth.uid()
    and public.current_app_user_role() = 'cleaner'
  );

-- ─── RLS: Property Inventory Items ──────────────────────────────────────────

alter table public.property_inventory_items enable row level security;

create policy "inventory_owner_all" on public.property_inventory_items
  for all
  using (owner_id = auth.uid() or public.current_app_user_role() in ('admin', 'supervisor'));

create policy "inventory_cleaner_select" on public.property_inventory_items
  for select
  using (
    public.current_app_user_role() = 'cleaner'
    and property_id in (
      select property_id from public.assignments where cleaner_id = auth.uid()
    )
  );

-- ─── RLS: Restock Requests ───────────────────────────────────────────────────

alter table public.restock_requests enable row level security;

create policy "restock_owner_all" on public.restock_requests
  for all
  using (owner_id = auth.uid() or public.current_app_user_role() in ('admin', 'supervisor'));

create policy "restock_cleaner_select" on public.restock_requests
  for select
  using (
    public.current_app_user_role() = 'cleaner'
    and requested_by_id = auth.uid()
  );

create policy "restock_cleaner_insert" on public.restock_requests
  for insert
  with check (
    public.current_app_user_role() = 'cleaner'
    and requested_by_id = auth.uid()
  );

-- ─── updated_at triggers ─────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger issues_updated_at
  before update on public.issues
  for each row execute function public.set_updated_at();

create trigger inventory_updated_at
  before update on public.property_inventory_items
  for each row execute function public.set_updated_at();

-- ─── Re-clean: auto-create linked assignment ─────────────────────────────────
-- When an assignment transitions to needs_reclean, insert a new unassigned
-- assignment linked back to the original via source_reference.

create or replace function public.create_reclean_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_id uuid;
begin
  -- Only fire when status changes TO needs_reclean
  if new.status = 'needs_reclean' and old.status <> 'needs_reclean' then
    insert into public.assignments (
      owner_id,
      property_id,
      cleaner_id,
      assignment_type,
      status,
      ack_status,
      priority,
      due_at,
      checkout_at,
      expected_duration_min,
      fixed_payout_amount,
      source_type,
      source_reference,
      created_by_user_id
    ) values (
      new.owner_id,
      new.property_id,
      null,                           -- unassigned re-clean
      'reclean',
      'unassigned',
      'pending',
      case new.priority when 'normal' then 'high' else new.priority end,
      new.due_at + interval '4 hours', -- default 4h buffer
      new.checkout_at,
      new.expected_duration_min,
      new.fixed_payout_amount,
      'reclean',
      'reclean:' || new.id::text,
      new.owner_id
    ) returning id into v_new_id;

    -- Snapshot the same checklist if the property has one
    if new.property_id is not null then
      insert into public.assignment_checklist_items (
        assignment_id,
        template_item_id,
        section_name,
        label,
        required,
        photo_category,
        sort_order
      )
      select
        v_new_id,
        aci.template_item_id,
        aci.section_name,
        aci.label,
        aci.required,
        aci.photo_category,
        aci.sort_order
      from public.assignment_checklist_items aci
      where aci.assignment_id = new.id;
    end if;
  end if;

  return new;
end;
$$;

create trigger assignments_reclean_trigger
  after update on public.assignments
  for each row execute function public.create_reclean_assignment();

-- ─── Helper view: dashboard exception counts ─────────────────────────────────

create or replace view public.v_exception_counts as
select
  i.owner_id,
  count(*) filter (where i.status in ('open', 'acknowledged', 'in_progress')) as open_issues,
  count(*) filter (where i.status in ('open', 'acknowledged', 'in_progress') and i.severity in ('high', 'critical')) as critical_issues,
  count(*) filter (where i.issue_type = 'maintenance' and i.status not in ('resolved', 'closed')) as open_maintenance
from public.issues i
group by i.owner_id;

create or replace view public.v_low_inventory as
select
  pii.owner_id,
  pii.id,
  pii.property_id,
  p.name as property_name,
  pii.name as item_name,
  pii.category,
  pii.unit,
  pii.current_quantity,
  pii.reorder_threshold
from public.property_inventory_items pii
join public.properties p on p.id = pii.property_id
where pii.active = true
  and pii.current_quantity <= pii.reorder_threshold;

create or replace view public.v_pending_recleans as
select
  a.owner_id,
  a.id,
  a.property_id,
  p.name as property_name,
  a.status,
  a.due_at,
  a.priority,
  a.source_reference
from public.assignments a
join public.properties p on p.id = a.property_id
where a.assignment_type = 'reclean'
  and a.status in ('unassigned', 'assigned', 'confirmed', 'in_progress');
