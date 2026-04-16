create extension if not exists "pgcrypto";

create type public.user_role as enum ('owner', 'admin', 'supervisor', 'cleaner');
create type public.assignment_status as enum (
  'unassigned',
  'assigned',
  'confirmed',
  'in_progress',
  'completed_pending_review',
  'approved',
  'needs_reclean',
  'cancelled'
);
create type public.assignment_ack_status as enum ('pending', 'accepted', 'declined', 'expired');
create type public.assignment_priority as enum ('normal', 'high', 'urgent');

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  phone text,
  full_name text not null,
  role public.user_role not null default 'cleaner',
  avatar_url text,
  active boolean not null default true,
  availability text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete restrict,
  name text not null,
  template_type text,
  version integer not null default 1,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates (id) on delete cascade,
  section_name text,
  label text not null,
  instruction_text text,
  reference_media_url text,
  required boolean not null default true,
  sort_order integer not null default 0,
  photo_category text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete restrict,
  name text not null,
  address_line_1 text,
  city text,
  state text,
  postal_code text,
  bedrooms integer,
  bathrooms numeric(4,1),
  default_clean_price numeric(10,2),
  difficulty_score integer check (difficulty_score between 1 and 5),
  default_cleaner_id uuid references public.users (id) on delete set null,
  timezone text not null default 'UTC',
  access_notes text,
  parking_notes text,
  primary_checklist_template_id uuid references public.checklist_templates (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete restrict,
  property_id uuid not null references public.properties (id) on delete restrict,
  cleaner_id uuid references public.users (id) on delete set null,
  assignment_type text not null default 'cleaning',
  status public.assignment_status not null default 'unassigned',
  ack_status public.assignment_ack_status not null default 'pending',
  priority public.assignment_priority not null default 'normal',
  checkout_at timestamptz,
  due_at timestamptz not null,
  expected_duration_min integer,
  fixed_payout_amount numeric(10,2),
  source_type text not null default 'manual',
  source_reference text,
  created_by_user_id uuid references public.users (id) on delete set null,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint assignments_source_reference_unique unique (property_id, source_reference)
);

create table public.assignment_checklist_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  template_item_id uuid references public.checklist_template_items (id) on delete set null,
  section_name text,
  label text not null,
  required boolean not null default true,
  photo_category text,
  sort_order integer not null default 0,
  completed boolean not null default false,
  completed_by_id uuid references public.users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.assignment_photos (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  photo_category text not null,
  storage_path text not null,
  file_size_bytes integer not null check (file_size_bytes <= 5242880),
  captured_by_id uuid references public.users (id) on delete set null,
  captured_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.assignment_notes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  note_type text not null default 'general',
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.assignment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references public.users (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.users (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_user_id uuid references public.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.current_app_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_admin_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_user_role() in ('owner', 'admin', 'supervisor'), false)
$$;

create or replace function public.can_access_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignments
    where id = target_assignment_id
      and (
        public.is_admin_role()
        or cleaner_id = auth.uid()
      )
  )
$$;

create or replace function public.can_access_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = target_property_id
      and (
        public.is_admin_role()
        or exists (
          select 1
          from public.assignments a
          where a.property_id = p.id
            and a.cleaner_id = auth.uid()
        )
      )
  )
$$;

create or replace function public.enforce_assignment_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  photo_count integer;
begin
  select count(*) into photo_count
  from public.assignment_photos
  where assignment_id = new.assignment_id;

  if tg_op = 'INSERT' and photo_count >= 10 then
    raise exception 'Assignments cannot have more than 10 photos.';
  end if;

  return new;
end;
$$;

create trigger assignment_photo_limit
before insert on public.assignment_photos
for each row
execute function public.enforce_assignment_photo_limit();

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bootstrap_role public.user_role;
begin
  select case
    when new.raw_user_meta_data ->> 'role' in ('owner', 'admin', 'supervisor', 'cleaner')
      then (new.raw_user_meta_data ->> 'role')::public.user_role
    when not exists (select 1 from public.users)
      then 'owner'::public.user_role
    else 'cleaner'::public.user_role
  end
  into bootstrap_role;

  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    bootstrap_role
  )
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

create index idx_assignments_owner_due_status
  on public.assignments (owner_id, due_at, status);

create index idx_assignments_cleaner_due
  on public.assignments (cleaner_id, due_at);

create index idx_assignment_events_assignment
  on public.assignment_events (assignment_id, created_at);

create index idx_audit_logs_entity
  on public.audit_logs (entity_type, entity_id, created_at);

alter table public.users enable row level security;
alter table public.properties enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_checklist_items enable row level security;
alter table public.assignment_photos enable row level security;
alter table public.assignment_notes enable row level security;
alter table public.assignment_events enable row level security;
alter table public.audit_logs enable row level security;

create policy "users can read self or admins can read all"
on public.users
for select
to authenticated
using (auth.uid() = id or public.is_admin_role());

create policy "users can update self or admins can update all"
on public.users
for update
to authenticated
using (auth.uid() = id or public.is_admin_role())
with check (auth.uid() = id or public.is_admin_role());

create policy "admins can read properties"
on public.properties
for select
to authenticated
using (public.can_access_property(id));

create policy "admins can manage properties"
on public.properties
for all
to authenticated
using (public.is_admin_role())
with check (public.is_admin_role());

create policy "admins can read checklist templates"
on public.checklist_templates
for select
to authenticated
using (public.is_admin_role());

create policy "admins can manage checklist templates"
on public.checklist_templates
for all
to authenticated
using (public.is_admin_role())
with check (public.is_admin_role());

create policy "admins can read checklist template items"
on public.checklist_template_items
for select
to authenticated
using (
  exists (
    select 1
    from public.checklist_templates template
    where template.id = checklist_template_items.template_id
      and public.is_admin_role()
  )
);

create policy "admins can manage checklist template items"
on public.checklist_template_items
for all
to authenticated
using (public.is_admin_role())
with check (public.is_admin_role());

create policy "admins and assigned cleaners can read assignments"
on public.assignments
for select
to authenticated
using (public.can_access_assignment(id));

create policy "admins can insert assignments"
on public.assignments
for insert
to authenticated
with check (public.is_admin_role());

create policy "admins and assigned cleaners can update assignments"
on public.assignments
for update
to authenticated
using (public.can_access_assignment(id))
with check (public.can_access_assignment(id));

create policy "linked users can read assignment checklist items"
on public.assignment_checklist_items
for select
to authenticated
using (public.can_access_assignment(assignment_id));

create policy "linked users can update assignment checklist items"
on public.assignment_checklist_items
for update
to authenticated
using (public.can_access_assignment(assignment_id))
with check (public.can_access_assignment(assignment_id));

create policy "admins can insert assignment checklist items"
on public.assignment_checklist_items
for insert
to authenticated
with check (public.is_admin_role());

create policy "linked users can read assignment photos"
on public.assignment_photos
for select
to authenticated
using (public.can_access_assignment(assignment_id));

create policy "linked users can insert assignment photos"
on public.assignment_photos
for insert
to authenticated
with check (public.can_access_assignment(assignment_id));

create policy "linked users can read assignment notes"
on public.assignment_notes
for select
to authenticated
using (public.can_access_assignment(assignment_id));

create policy "linked users can insert assignment notes"
on public.assignment_notes
for insert
to authenticated
with check (public.can_access_assignment(assignment_id));

create policy "linked users can read assignment events"
on public.assignment_events
for select
to authenticated
using (public.can_access_assignment(assignment_id));

create policy "linked users can insert assignment events"
on public.assignment_events
for insert
to authenticated
with check (public.can_access_assignment(assignment_id));

create policy "admins can read audit logs"
on public.audit_logs
for select
to authenticated
using (public.is_admin_role());

create policy "admins can insert audit logs"
on public.audit_logs
for insert
to authenticated
with check (public.is_admin_role());
