-- Sprint B — B-3: per-job message thread between cleaner and owner/admin.
-- Carries free text plus structured system events (decline, running_late)
-- so the thread doubles as an audit log per assignment.

create table if not exists public.job_messages (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  author_id uuid references public.users (id) on delete set null,
  author_role text,
  body text not null,
  message_type text not null default 'text', -- 'text' | 'decline' | 'running_late' | 'system'
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_job_messages_assignment_created
  on public.job_messages (assignment_id, created_at);

alter table public.job_messages enable row level security;

drop policy if exists "linked users can read job messages" on public.job_messages;
create policy "linked users can read job messages"
on public.job_messages
for select
to authenticated
using (
  public.is_admin_role()
  or exists (
    select 1 from public.assignments a
    where a.id = job_messages.assignment_id
      and (a.cleaner_id = auth.uid() or a.owner_id = auth.uid())
  )
);

drop policy if exists "linked users can post job messages" on public.job_messages;
create policy "linked users can post job messages"
on public.job_messages
for insert
to authenticated
with check (
  public.is_admin_role()
  or exists (
    select 1 from public.assignments a
    where a.id = job_messages.assignment_id
      and (a.cleaner_id = auth.uid() or a.owner_id = auth.uid())
  )
);
