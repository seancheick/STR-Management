-- Track which notifications the recipient has actually opened so the
-- cleaner inbox can show an unread count (red dot on the nav icon).
-- Nullable so every existing row counts as unread.

alter table public.notifications
  add column if not exists seen_at timestamptz;

create index if not exists idx_notifications_recipient_unread
  on public.notifications (recipient_id, created_at desc)
  where seen_at is null;
