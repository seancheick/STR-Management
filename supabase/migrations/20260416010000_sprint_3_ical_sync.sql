-- Sprint 3: iCal Sync
-- Tables: property_calendar_sources, calendar_sync_logs

-- ─── Calendar Sources ─────────────────────────────────────────────────────────

create table public.property_calendar_sources (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.users (id) on delete restrict,
  property_id    uuid not null references public.properties (id) on delete cascade,
  name           text not null,
  ical_url       text not null,
  platform       text not null default 'other', -- 'airbnb' | 'vrbo' | 'booking' | 'other'
  active         boolean not null default true,
  last_synced_at timestamptz,
  created_at     timestamptz not null default timezone('utc', now()),
  updated_at     timestamptz not null default timezone('utc', now()),
  constraint calendar_sources_url_unique unique (property_id, ical_url)
);

create index idx_calendar_sources_property_id on public.property_calendar_sources (property_id);
create index idx_calendar_sources_owner_id    on public.property_calendar_sources (owner_id);
create index idx_calendar_sources_active      on public.property_calendar_sources (active);

-- ─── Sync Logs ────────────────────────────────────────────────────────────────

create type public.sync_result as enum ('success', 'partial', 'failed');

create table public.calendar_sync_logs (
  id                      uuid primary key default gen_random_uuid(),
  calendar_source_id      uuid not null references public.property_calendar_sources (id) on delete cascade,
  owner_id                uuid not null references public.users (id) on delete restrict,
  property_id             uuid not null references public.properties (id) on delete restrict,
  result                  public.sync_result not null default 'success',
  events_found            integer not null default 0,
  assignments_created     integer not null default 0,
  assignments_skipped     integer not null default 0,
  conflict_count          integer not null default 0,
  error_message           text,
  synced_at               timestamptz not null default timezone('utc', now())
);

create index idx_sync_logs_source_id  on public.calendar_sync_logs (calendar_source_id);
create index idx_sync_logs_owner_id   on public.calendar_sync_logs (owner_id);
create index idx_sync_logs_synced_at  on public.calendar_sync_logs (synced_at desc);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

create trigger calendar_sources_updated_at
  before update on public.property_calendar_sources
  for each row execute function public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.property_calendar_sources enable row level security;
alter table public.calendar_sync_logs enable row level security;

create policy "calendar_sources_owner_all" on public.property_calendar_sources
  for all
  using (owner_id = auth.uid() or public.current_app_user_role() in ('admin', 'supervisor'));

create policy "sync_logs_owner_all" on public.calendar_sync_logs
  for all
  using (owner_id = auth.uid() or public.current_app_user_role() in ('admin', 'supervisor'));
