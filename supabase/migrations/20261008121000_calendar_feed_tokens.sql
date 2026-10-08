-- Dedicated, revocable secret for the owner's ICS subscription feed.
-- Previously the feed URL used the owner's user id, which every admin and
-- supervisor in the tenant can read, and which can never be rotated.
-- RLS is on with no policies: only server code using the service role can
-- read or write tokens, so staff cannot discover the owner's feed URL.
create table if not exists public.calendar_feed_tokens (
  owner_id uuid primary key references public.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.calendar_feed_tokens enable row level security;
revoke all on public.calendar_feed_tokens from anon, authenticated;
