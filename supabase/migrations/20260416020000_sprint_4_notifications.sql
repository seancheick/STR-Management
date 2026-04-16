-- Sprint 4: Notifications + SLA
-- Tables: device_subscriptions, notifications

-- ─── Device Subscriptions (Web Push) ─────────────────────────────────────────

create table public.device_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  endpoint      text not null,
  p256dh        text not null,
  auth_key      text not null,
  user_agent    text,
  active        boolean not null default true,
  created_at    timestamptz not null default timezone('utc', now()),
  constraint device_subscriptions_endpoint_unique unique (user_id, endpoint)
);

create index idx_device_subscriptions_user_id on public.device_subscriptions (user_id);
create index idx_device_subscriptions_active  on public.device_subscriptions (active);

-- ─── Notifications ────────────────────────────────────────────────────────────

create type public.notification_channel as enum ('push', 'sms', 'email');
create type public.notification_status  as enum ('pending', 'sent', 'failed', 'skipped');

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references public.users (id) on delete set null,
  recipient_id    uuid not null references public.users (id) on delete cascade,
  assignment_id   uuid references public.assignments (id) on delete set null,
  channel         public.notification_channel not null default 'push',
  status          public.notification_status not null default 'pending',
  notification_type text not null,  -- 'reminder_24h' | 'reminder_2h' | 'overdue' | 'sla_breach' | 'new_assignment'
  title           text not null,
  body            text not null,
  sent_at         timestamptz,
  error_message   text,
  created_at      timestamptz not null default timezone('utc', now())
);

create index idx_notifications_recipient_id  on public.notifications (recipient_id);
create index idx_notifications_assignment_id on public.notifications (assignment_id);
create index idx_notifications_created_at    on public.notifications (created_at desc);
create index idx_notifications_status        on public.notifications (status);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.device_subscriptions enable row level security;
alter table public.notifications         enable row level security;

-- Users manage their own subscriptions
create policy "device_sub_own" on public.device_subscriptions
  for all
  using (user_id = auth.uid());

-- Owner/admin/supervisor can read all notifications for their org
create policy "notifications_owner_read" on public.notifications
  for select
  using (owner_id = auth.uid() or public.current_app_user_role() in ('admin', 'supervisor'));

-- Recipients can read their own notifications
create policy "notifications_recipient_read" on public.notifications
  for select
  using (recipient_id = auth.uid());

-- Service role inserts (via cron / server action) — no user RLS needed for insert
-- (server uses service role key for cron jobs)
