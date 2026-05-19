-- ────────────────────────────────────────────────────────────────────
-- Multi-tenancy Phase 2: RLS rewrite
--
-- Every tenant-scoped policy was previously
--   (owner_id = auth.uid()) OR is_admin_role()
-- which let ANY admin/supervisor see ANY tenant's data. Replace with
--   owner_id = current_owner_id() AND is_admin_role()
-- so admins see only THEIR tenant.
--
-- Cleaner read paths (cleaner_id = auth.uid()) are unchanged because
-- a cleaner who isn't on the assignment can't see it regardless of
-- tenant. The new can_access_* helpers add an explicit owner_id
-- match for the admin branch.
--
-- Idempotent: drops the old policy first, then creates the new one.
-- Re-runnable on a partially-applied schema.
-- ────────────────────────────────────────────────────────────────────

-- 1. Tighten the assignment-access helper: admins ONLY see their tenant.
create or replace function public.can_access_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assignments
    where id = target_assignment_id
      and (
        (owner_id = public.current_owner_id()
          and public.current_app_user_role() in ('owner', 'admin', 'supervisor'))
        or cleaner_id = auth.uid()
      )
  )
$$;

-- 2. Same for property access.
create or replace function public.can_access_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties p
    where p.id = target_property_id
      and (
        (p.owner_id = public.current_owner_id()
          and public.current_app_user_role() in ('owner', 'admin', 'supervisor'))
        or exists (
          select 1 from public.assignments a
          where a.property_id = p.id and a.cleaner_id = auth.uid()
        )
      )
  )
$$;

-- ─── properties ─────────────────────────────────────────────────────
drop policy if exists "admins can manage properties" on public.properties;
create policy "tenant admins manage properties"
on public.properties
for all
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- (The read-via-cleaner policy already uses can_access_property() which
-- we just hardened. No change needed.)

-- ─── assignments ────────────────────────────────────────────────────
drop policy if exists "admins can insert assignments" on public.assignments;
create policy "tenant admins insert assignments"
on public.assignments
for insert
to authenticated
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- (Read/update policies already use can_access_assignment() which we
-- just hardened. They cascade to the new tenant check automatically.)

-- ─── reservations ──────────────────────────────────────────────────
drop policy if exists "admins manage reservations" on public.reservations;
drop policy if exists "admins read reservations" on public.reservations;
create policy "tenant admins manage reservations"
on public.reservations
for all
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- ─── notifications ─────────────────────────────────────────────────
drop policy if exists "notifications_owner_read" on public.notifications;
drop policy if exists "notifications_recipient_read" on public.notifications;
create policy "tenant admins read notifications"
on public.notifications
for select
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);
create policy "recipient reads own notifications"
on public.notifications
for select
to authenticated
using (recipient_id = auth.uid());

-- ─── calendar_sync_logs ────────────────────────────────────────────
drop policy if exists "sync_logs_owner_all" on public.calendar_sync_logs;
create policy "tenant admins manage calendar_sync_logs"
on public.calendar_sync_logs
for all
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- ─── payout_batches ────────────────────────────────────────────────
drop policy if exists "payout_batches_owner_all" on public.payout_batches;
create policy "tenant admins manage payout_batches"
on public.payout_batches
for all
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- ─── payout_entries ───────────────────────────────────────────────
drop policy if exists "payout_entries_owner_all" on public.payout_entries;
create policy "tenant admins manage payout_entries"
on public.payout_entries
for all
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- payout_entries_cleaner_read stays — cleaners see their own entries.

-- ─── property_calendar_sources ────────────────────────────────────
drop policy if exists "calendar_sources_owner_all" on public.property_calendar_sources;
create policy "tenant admins manage property_calendar_sources"
on public.property_calendar_sources
for all
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- ─── property_inventory_items ─────────────────────────────────────
drop policy if exists "inventory_owner_all" on public.property_inventory_items;
create policy "tenant admins manage property_inventory_items"
on public.property_inventory_items
for all
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- inventory_cleaner_select stays — joins via assignment.

-- ─── checklist_templates ──────────────────────────────────────────
drop policy if exists "admins can manage checklist templates" on public.checklist_templates;
drop policy if exists "admins can read checklist templates" on public.checklist_templates;
create policy "tenant admins manage checklist_templates"
on public.checklist_templates
for all
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- ─── recurring_tasks ─────────────────────────────────────────────
drop policy if exists "admins can manage recurring tasks" on public.recurring_tasks;
drop policy if exists "admins can read recurring tasks" on public.recurring_tasks;
create policy "tenant admins manage recurring_tasks"
on public.recurring_tasks
for all
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- ─── issues ──────────────────────────────────────────────────────
drop policy if exists "issues_owner_all" on public.issues;
create policy "tenant admins manage issues"
on public.issues
for all
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);
-- issues_cleaner_insert / issues_cleaner_select stay.

-- ─── restock_requests ────────────────────────────────────────────
drop policy if exists "restock_owner_all" on public.restock_requests;
create policy "tenant admins manage restock_requests"
on public.restock_requests
for all
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- ─── audit_logs ──────────────────────────────────────────────────
drop policy if exists "admins can read audit logs" on public.audit_logs;
drop policy if exists "admins can insert audit logs" on public.audit_logs;
create policy "tenant admins read audit_logs"
on public.audit_logs
for select
to authenticated
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);
create policy "tenant admins insert audit_logs"
on public.audit_logs
for insert
to authenticated
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);

-- ─── checklist_template_items (transitive via template) ─────────
drop policy if exists "admins can manage checklist template items" on public.checklist_template_items;
drop policy if exists "admins can read checklist template items" on public.checklist_template_items;
create policy "tenant admins manage checklist_template_items"
on public.checklist_template_items
for all
to authenticated
using (
  exists (
    select 1 from public.checklist_templates t
    where t.id = template_id
      and t.owner_id = public.current_owner_id()
      and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
  )
)
with check (
  exists (
    select 1 from public.checklist_templates t
    where t.id = template_id
      and t.owner_id = public.current_owner_id()
      and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
  )
);

-- ─── issue_media (transitive via issue) ──────────────────────────
drop policy if exists "issue_media_owner_all" on public.issue_media;
create policy "tenant admins manage issue_media"
on public.issue_media
for all
to authenticated
using (
  exists (
    select 1 from public.issues i
    where i.id = issue_id
      and i.owner_id = public.current_owner_id()
      and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
  )
)
with check (
  exists (
    select 1 from public.issues i
    where i.id = issue_id
      and i.owner_id = public.current_owner_id()
      and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
  )
);
-- issue_media_cleaner_insert / issue_media_cleaner_select stay.

-- ─── users ───────────────────────────────────────────────────────
drop policy if exists "users can read self or admins can read all" on public.users;
drop policy if exists "users can update self or admins can update all" on public.users;
create policy "self or tenant-admin can read user"
on public.users
for select
to authenticated
using (
  id = auth.uid()
  or (
    owner_id = public.current_owner_id()
    and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
  )
);
create policy "self or tenant-admin can update user"
on public.users
for update
to authenticated
using (
  id = auth.uid()
  or (
    owner_id = public.current_owner_id()
    and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
  )
)
with check (
  id = auth.uid()
  or (
    owner_id = public.current_owner_id()
    and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
  )
);

-- ────────────────────────────────────────────────────────────────
-- Tables left intentionally unchanged
-- ────────────────────────────────────────────────────────────────
--   device_subscriptions       — already scoped by user_id = auth.uid()
--   early_access_requests      — public form, admin-only read/write
--   assignment_checklist_items — uses can_access_assignment() (tightened above)
--   assignment_events          — uses can_access_assignment()
--   assignment_notes           — uses can_access_assignment()
--   assignment_photos          — uses can_access_assignment()
--   job_messages               — uses can_access_assignment()
