-- Phase 2 patch: job_messages was still using is_admin_role(), letting any
-- admin from any tenant read/post messages on any job. Switch to the
-- already-hardened can_access_assignment() helper.

drop policy if exists "linked users can read job messages" on public.job_messages;
drop policy if exists "linked users can post job messages" on public.job_messages;

create policy "linked users can read job messages"
on public.job_messages
for select
to authenticated
using (public.can_access_assignment(assignment_id));

create policy "linked users can post job messages"
on public.job_messages
for insert
to authenticated
with check (public.can_access_assignment(assignment_id));
