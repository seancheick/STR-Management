-- ─── Sprint 6: Templates + Supervisor ────────────────────────────────────────
-- Adds supervisor review fields to assignments, richer maintenance fields to
-- issues, and visual reference fields to assignment checklist items so they
-- can be snapshotted from template items.

-- ─── Supervisor review fields on assignments ─────────────────────────────────
alter table public.assignments
  add column if not exists review_notes    text,
  add column if not exists reviewed_by_id uuid references public.users (id) on delete set null,
  add column if not exists reviewed_at     timestamptz;

-- Index to power the supervisor review queue
create index if not exists idx_assignments_pending_review
  on public.assignments (owner_id, due_at)
  where status = 'completed_pending_review';

-- ─── Richer maintenance fields on issues ─────────────────────────────────────
alter table public.issues
  add column if not exists assigned_to_id   uuid references public.users (id) on delete set null,
  add column if not exists resolution_notes text,
  add column if not exists due_by_date      date;

-- ─── Visual reference fields on assignment checklist item snapshots ──────────
-- These are copied from checklist_template_items at assignment creation time
-- so the checklist remains immutable even if the template is edited later.
alter table public.assignment_checklist_items
  add column if not exists instruction_text    text,
  add column if not exists reference_media_url text;
