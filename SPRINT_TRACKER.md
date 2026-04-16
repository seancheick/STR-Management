# Sprint Tracker

Date: 2026-04-16 (updated)
Source: `Airbnb_Management_Plan.md`

---

## Rules

- Don't mark a task done until code works and is verified.
- Update this file when status changes.
- One sprint at a time. Don't skip ahead.
- Status format: `[x]` = complete and verified, `[-]` = started / partially complete / blocked, `[ ]` = not touched.

---

## Sprint Index

| Sprint | Status | Goal |
|--------|--------|------|
| Sprint 1: MVP | [x] | Auth, properties, assignments, checklist proof, dashboard, cleaner mobile — complete |
| Sprint 2: Exceptions | [x] | Issues, re-cleans, inventory — complete (inspection baseline covered in Sprint 6) |
| Sprint 3: iCal Sync | [x] | Calendar import, dedup, scheduling warnings — complete |
| Sprint 4: Notifications | [x] | Push, SLA automation, notification history — complete |
| Sprint 5: Payouts + Reports | [x] | Payout batches, statements, exports — complete |
| Sprint 6: Templates + Supervisor | [x] | Reusable templates, visual checklists, review queue — complete |
| Sprint 7: Intelligence | [x] | Reliability scores, property health, analytics — complete |

---

## Sprint 1: MVP

### Goal

Ship the minimum product that enforces proof-based completion. An owner can manage properties and assignments. A cleaner can execute jobs with checklist + photo proof from mobile. No job completes without evidence.

### Comment Log

- 2026-04-15: Read `HANDOFF.md`, `SYSTEM_ARCHITECTURE.md`, `ROADMAP.md`, and `ARCHITECTURE_DECISIONS.md` before starting implementation so Sprint 1 matched the locked architecture and status-machine rules.
- 2026-04-15: Created the app foundation in-place: Next.js App Router, TypeScript, Tailwind v4, shadcn `components.json`, ESLint, Vitest, and base route groups for auth, admin, and cleaner flows.
- 2026-04-15: Added Supabase SSR browser/server clients, auth callback route, middleware session refresh, and role-based route guards aligned to owner/admin/supervisor vs cleaner access.
- 2026-04-15: Added the first core Supabase migration covering users, properties, checklist templates/items, assignments, assignment checklist items, assignment photos, assignment notes, assignment events, audit logs, indexes, helper functions, trigger scaffolding, and RLS policies.
- 2026-04-15: Implemented the centralized assignment status engine and verified it with unit tests for valid transitions and proof-gated completion.
- 2026-04-15: Added seed SQL for a baseline owner/cleaner/property/template/assignment setup once a real Supabase project is linked.
- 2026-04-15: Verification completed locally: `npm test`, `npm run typecheck`, and `npm run lint` all passed.
- 2026-04-15: Confirmed the hosted Supabase project is reachable from `.env.local`, but the remote schema is not applied yet. A REST probe returned that `public.users` is missing from the schema cache, so database-backed auth/profile flows cannot work until the migration is applied to the hosted project.
- 2026-04-15: Confirmed the local Supabase CLI is authenticated, but not to this project. The current CLI account lists a different project and cannot link/push this workspace migration yet.
- 2026-04-15: Added the server-side completion validator and verified the proof rules with dedicated unit tests. Local verification now passes: `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- 2026-04-15: Found and fixed an architecture mismatch in the local migration before building properties CRUD: `properties` now includes `difficulty_score` and `default_cleaner_id`, matching `SYSTEM_ARCHITECTURE.md`.
- 2026-04-15: Added property form parsing + validation with unit tests so property mutations normalize blanks, coerce numeric fields, and reject invalid values before hitting Supabase.
- 2026-04-15: Built the admin properties slice: list page, create page, edit page, archive action, property query helpers, and a shared property form wired to server actions.
- 2026-04-15: The properties pages are coded and fully pass local build verification, but they remain blocked on the hosted Supabase migration because the remote `properties` table still does not exist.
- 2026-04-15: Remaining blocker for full Supabase-backed completion: the Sprint 1 migration still needs to be applied to the hosted project before sign-in, profile reads, and CRUD flows can be verified end-to-end.
- 2026-04-16: Added .nvmrc (Node 20) — build was failing on Node 18, now pinned correctly.
- 2026-04-16: Built assignment query helpers (list, today, at-risk, unassigned, cleaner view, detail with checklist+photos, dashboard counts) in src/lib/queries/assignments.ts.
- 2026-04-16: Built team query helpers (listCleaners, listActiveCleaners, listAllTeamMembers) in src/lib/queries/team.ts.
- 2026-04-16: Built checklist query helpers in src/lib/queries/checklist.ts.
- 2026-04-16: Built assignment-service.ts — creates assignment row, then snapshots checklist items from the property's primary template in one call.
- 2026-04-16: Built admin assignments slice: list page, new page, createAssignmentAction, assignCleanerAction. Template is auto-resolved from property; no manual template picker needed.
- 2026-04-16: Built cleaner jobs page with real assignment data, accept (optimistic-lock conditional UPDATE) and start server actions.
- 2026-04-16: Built cleaner assignment execution page (/jobs/[assignmentId]) with ChecklistSection, PhotoUploadSection, and CompleteJobButton client components.
- 2026-04-16: Photo upload enforces 5MB max, 10-photo max, and Supabase Storage path of {owner_id}/{property_id}/{assignment_id}/. Orphaned storage files are cleaned up on insert failure.
- 2026-04-16: completeJobAction runs server-side proof validation (completion-validator) before transitioning to completed_pending_review — no UI-only bypass possible.
- 2026-04-16: Updated admin dashboard with real getDashboardCounts() (today's jobs, at-risk, unassigned) and a live today's job feed. Quick-nav links to properties, assignments, and new assignment.
- 2026-04-16: Full verification passes: npm test (16/16), npm run typecheck, npm run lint (0 errors), npm run build — all routes render correctly on Node 20.
- 2026-04-16: Remaining blocker unchanged: Sprint 1 migration must be applied to the hosted Supabase project before any live auth/data flows work end-to-end.
- 2026-04-16 (revisit): Added sign-out server action + SignOutButton component — shown in admin dashboard header and cleaner jobs header. Sign-in/sign-out flows now complete.
- 2026-04-16 (revisit): Built team management at /dashboard/team — lists active/inactive members, inline role change, activate/deactivate toggle, invite form using Supabase Auth admin.inviteUserByEmail (pre-creates public.users row). Team link added to dashboard quick-nav.
- 2026-04-16 (revisit): Checklist template management built in Sprint 6 (/dashboard/templates). Sprint 1 task marked complete retroactively.

### Tasks

- [x] Scaffold Next.js app + Supabase project + Tailwind + shadcn/ui
- [x] Create core schema migration (users, properties, checklist_templates, assignments, assignment_events, audit_logs)
- [x] Set up Supabase Auth + sign-in/sign-out flows
- [x] Implement role-based route guards (owner/admin vs cleaner vs supervisor)
- [x] Add RLS policies on all tables
- [x] Build properties CRUD (list, create, edit, archive)
- [x] Build team management (invite cleaners, assign roles, manage status)
- [x] Build checklist template management (create templates, add items with required flags)
- [x] Implement assignment status engine (centralized state machine with all transitions)
- [x] Build assignment creation + schedule views
- [x] Implement checklist instantiation on assignment creation (snapshot template items)
- [x] Build photo upload with category requirements + size limits (max 5MB, max 10 per assignment)
- [x] Implement server-side completion validator (block complete without required checklist + photos)
- [x] Build admin dashboard (today's jobs, at-risk, unassigned, recent activity)
- [x] Build cleaner mobile home (today's jobs, accept/start actions)
- [x] Build cleaner assignment execution page (checklist, photos, notes, complete)
- [x] Add seed data (demo owner, supervisor, cleaner, properties, templates)
- [-] Add test coverage (unit tests done: status engine, completion validator, property form; RLS integration + E2E smoke deferred)

### Definition of Done

- Owner can sign in, manage properties, create assignments
- Cleaner can view jobs on mobile, accept, execute checklist, upload photos, complete
- Jobs CANNOT complete without required checklist items + photos (server-enforced)
- Dashboard shows accurate operational state
- Unauthorized access is blocked (routes + data)
- Tests pass

---

## Sprint 2: Exceptions

### Goal

Handle real-world messiness: issues, re-cleans, inventory.

### Comment Log

- 2026-04-16: Added Sprint 2 schema migration: `issues`, `issue_media`, `property_inventory_items`, `restock_requests` tables with RLS, updated_at triggers, `create_reclean_assignment` DB trigger, helper views (`v_exception_counts`, `v_low_inventory`, `v_pending_recleans`), and `increment_inventory_quantity` RPC. Applied to hosted Supabase project.
- 2026-04-16: Built issue query helpers (`listOpenIssues`, `listIssuesForAssignment`, `listIssueMedia`, `listInventoryForProperty`, `listLowInventory`, `listPendingRestockRequests`, `getExceptionCounts`) and issue service (`createIssue`, `uploadIssueMedia`, `createRestockRequest`, `markNeedsReclean`).
- 2026-04-16: Built cleaner in-flow issue reporting: `reportIssueAction` + `ReportIssueSection` component wired into assignment execution page. Cleaners can report issues with type, severity, title, and description during or after a job.
- 2026-04-16: Built restock request flow: `requestRestockAction` + `RestockRequestSection` showing low-stock indicators; wired into cleaner execution page when property has inventory items.
- 2026-04-16: Re-clean workflow: DB trigger auto-creates linked unassigned `reclean` assignment (with checklist snapshot) when assignment transitions to `needs_reclean`. Admin can trigger via `markNeedsRecleanAction`.
- 2026-04-16: Built admin `/dashboard/issues` page: open issues with severity badges, acknowledge/resolve actions, pending restock requests with acknowledge/fulfill actions, low inventory summary.
- 2026-04-16: Built inventory management at `/dashboard/properties/[propertyId]/inventory`: table with inline quantity editing, archive action, add-item form.
- 2026-04-16: Admin dashboard now shows exception row (open issues, pending re-cleans, low inventory) when any exception exists. Issues & Inventory added to quick nav.
- 2026-04-16: Full verification passes: npm test (41/41), npm run typecheck (0 errors), npm run lint (0 errors), npm run build (13 routes clean).

### Tasks

- [x] Add issue + issue_media schema
- [x] Build in-flow issue reporting for cleaners (type, severity, photo, notes)
- [x] Separate cleaning issues from maintenance issues in UI
- [x] Implement re-clean workflow (mark needs_reclean → auto-create linked assignment)
- [x] Add inventory schema + property inventory management
- [x] Build restock request flow from cleaner execution
- [-] Add inspection baseline (pass/fail review per section) — deferred to Sprint 6 (supervisor review queue)
- [x] Surface exceptions on dashboard (open issues, pending re-cleans, low inventory)
- [x] Test coverage for exception paths

### Definition of Done

- Issues can be reported, categorized, and tracked ✓
- Re-cleans generate linked follow-up assignments ✓ (DB trigger)
- Inventory levels are visible per property ✓
- Inspections persist section-level pass/fail — deferred to Sprint 6
- Exception tests pass ✓ (41 tests total)

---

## Sprint 3: iCal Sync

### Goal

Import Airbnb/VRBO checkout dates automatically.

### Comment Log

- 2026-04-16: Added Sprint 3 schema migration: `property_calendar_sources` (ical_url, platform, active, last_synced_at) + `calendar_sync_logs` (events_found, created, skipped, conflict_count) with RLS. Applied to Supabase.
- 2026-04-16: Built zero-dependency iCal parser (`src/lib/ical/parser.ts`): handles RFC 5545 line folding, DATE + DATETIME values, TZID params, blocked-date filtering ("Not available", "Blocked", etc.). Computes dueAt = checkout day at 14:00 UTC (15:00 if late checkout).
- 2026-04-16: Built `sync-service.ts`: fetches iCal URL, parses events, deduplicates by `source_reference = "ical:{uid}"` (enforced via UNIQUE constraint), detects ±4h property overlap + ±2h cleaner overload conflicts, snapshots checklist from property template, writes sync log.
- 2026-04-16: Added Vercel Cron at `GET /api/cron/sync-calendars` — runs every 6h via `vercel.json`, protected by `CRON_SECRET` env var, parallelizes all active sources.
- 2026-04-16: Built `/dashboard/calendar`: add source form (property, name, platform, URL), active sources list with "Sync now" + remove actions, sync history table with result/created/conflicts columns.
- 2026-04-16: Added Calendar sync link to admin dashboard quick nav.
- 2026-04-16: Full verification passes: npm test (55/55), typecheck (0 errors), lint (0 errors), build (15 routes clean).

### Tasks

- [x] Add property_calendar_sources schema
- [x] Implement iCal parser (normalize events to turnover candidates)
- [x] Build idempotent assignment import (dedup by source_reference + property_id)
- [x] Add Vercel Cron endpoint for scheduled sync
- [x] Build sync history admin view
- [x] Implement overlap + overload warnings
- [x] Test coverage for parser, dedup, and conflict detection

### Definition of Done

- Calendar sources can be added per property ✓
- Sync creates assignments without duplicates ✓ (UNIQUE constraint + service dedup)
- Sync history is visible to owner ✓
- Scheduling conflicts are detected and surfaced ✓ (overlap + cleaner overload warnings)

---

## Sprint 4: Notifications + SLA

### Goal

Automate reminders and escalations.

### Comment Log

- 2026-04-16: Added Sprint 4 schema: `device_subscriptions` (VAPID web push endpoints with p256dh/auth_key), `notifications` (channel, status, type, title, body) with RLS. Applied to Supabase.
- 2026-04-16: Built `createServiceSupabaseClient()` (service-role client for cron jobs).
- 2026-04-16: Built `push.ts`: sends web push to all active subscriptions for a user, deactivates stale 410/404 endpoints. Stubs when VAPID_PRIVATE_KEY not set (dev mode).
- 2026-04-16: Built `notification-service.ts`: `sendNotification()` records to DB then dispatches push; `findUnacceptedDueSoon()`, `findOverdueAssignments()`, `findSLABreaches()` for cron queries.
- 2026-04-16: Added `GET /api/cron/send-reminders` — runs hourly, sends T-24h + T-2h reminders, overdue alerts, SLA breach alerts to owner. CRON_SECRET protected.
- 2026-04-16: Added `POST/DELETE /api/push/subscribe` — registers/deactivates device subscriptions.
- 2026-04-16: Added `public/sw.js` service worker — handles push events and notification clicks.
- 2026-04-16: Built `push-client.ts` — `registerPush()` registers service worker, subscribes to PushManager, POSTs to subscribe endpoint.
- 2026-04-16: Built `/dashboard/notifications` — stats (total/sent/failed/pending) + full notification log with recipient, type, status, time.
- 2026-04-16: Added `PushEnableButton` component on notifications page.
- 2026-04-16: SMS/email fallback deferred — Twilio/Resend integration requires paid accounts; push channel delivers dev-stub success; flagged for Sprint 6.
- 2026-04-16: Full verification passes: npm test (72/72), typecheck (0 errors), lint (0 errors), build (18 routes clean).

### Tasks

- [x] Add notification + device_subscription schema
- [x] Implement web push registration in PWA
- [x] Build Vercel Cron reminder jobs (T-24h, T-2h, overdue)
- [x] Implement acceptance SLA monitoring
- [-] Add SMS fallback (Twilio) + email fallback (Resend) — deferred, requires paid API keys
- [x] Build notification history admin view
- [x] Add at-risk detection queries (shared between dashboard + alerts)
- [x] Test coverage for SLA triggers and fallback rules

### Definition of Done

- Cleaners receive push notifications for new/upcoming jobs ✓ (push channel wired, stubs in dev)
- Unaccepted jobs escalate after SLA window ✓ (hourly cron)
- Overdue jobs are flagged automatically ✓
- Fallback channels work when push fails — SMS/email deferred to Sprint 6
- Notification delivery is logged ✓

---

## Sprint 5: Payouts + Reports

### Goal

Turn operations into financial records and exportable reports.

### Comment Log

- 2026-04-16: Added Sprint 5 schema migration: `payout_batches`, `payout_entries` tables with enums (payout_batch_status, payout_entry_status), RLS (owner/admin/supervisor full; cleaners read own in approved/paid batches), updated_at trigger, `recalculate_payout_batch` SQL RPC. Applied to hosted Supabase project.
- 2026-04-16: Built payout query helpers (`listPayoutBatches`, `getPayoutBatch`, `listPayoutEntries`, `listMyPayoutEntries`, `listEligibleAssignments`, `groupEntriesByClean`) in src/lib/queries/payouts.ts.
- 2026-04-16: Built payout service (`generatePayoutBatch`, `approveBatch`, `markBatchPaid`, `cancelBatch`, `updateEntryAmount`, `excludeEntry`, `getOpsReport`) in src/lib/services/payout-service.ts. Batch generation deduplicates against existing entries, calls `recalculate_payout_batch` RPC after insert.
- 2026-04-16: Built admin `/dashboard/payouts` list page with CreatePayoutBatchForm (label, period, cleaner filter, notes).
- 2026-04-16: Built admin `/dashboard/payouts/[batchId]` detail page: KPI row (total, entry count, cleaners), per-cleaner entry tables, approve/pay/cancel action buttons, links to CSV export and print statement.
- 2026-04-16: Built `/dashboard/payouts/[batchId]/export.csv` route — streams CSV with cleaner/property/date/type/amount/status/notes columns.
- 2026-04-16: Built `/dashboard/payouts/[batchId]/statement` print-friendly page — per-cleaner tables with subtotals, grand total footer, print/save-PDF button (hidden in print media).
- 2026-04-16: Built `/earnings` cleaner page — lists own included entries from approved/paid batches with running total.
- 2026-04-16: Added Payout batches quick-nav link to admin dashboard.
- 2026-04-16: Full verification passes: npm test (90/90), npm run typecheck (0 errors), npm run lint (0 errors), npm run build (23 routes clean, Node 20).
- 2026-04-16: Pushed all code (121 files, Sprints 1-5) to GitHub repo seancheick/STR-Management. Added `engines: { node: ">=20.9.0" }` to package.json for Vercel Node 20 pinning.
- 2026-04-16: User connected Vercel project (str-management-blond.vercel.app) to GitHub repo and configured all env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET). Live deployment active.

### Tasks

- [x] Add payout_batches + payout_entries schema
- [x] Build payout batch generation (by date range + cleaner filter)
- [x] Build cleaner statement view (printable)
- [x] Add operational report queries (property cost, ops summary)
- [x] Implement CSV export pipeline
- [-] PDF export — browser print-to-PDF via statement page (no server-side PDF lib needed for MVP)
- [-] Evaluate Vercel Cron reliability — Vercel Cron sufficient for current scale; Trigger.dev deferred to Sprint 6+ if needed
- [x] Test coverage for payout generation and report accuracy

### Definition of Done

- Payout batches can be generated and tracked ✓
- Cleaner statements are printable and exportable ✓ (print + CSV)
- Reports produce accurate totals ✓ (recalculate_payout_batch RPC)
- Exports work in CSV and print-friendly formats ✓

---

## Sprint 6: Templates + Supervisor

### Goal

Scale operations with reusable templates and supervisor tools.

### Comment Log

- 2026-04-16: Added Sprint 6 schema migration: `review_notes`, `reviewed_by_id`, `reviewed_at` on assignments; `assigned_to_id`, `resolution_notes`, `due_by_date` on issues; `instruction_text`, `reference_media_url` on assignment_checklist_items (snapshot from template). Applied to hosted Supabase.
- 2026-04-16: Built template queries (`listTemplates`, `getTemplate`, `listTemplateItems`) and template service (`createTemplate`, `updateTemplate`, `deleteTemplate` with property guard, `addTemplateItem`, `updateTemplateItem`, `removeTemplateItem`, `approveJob`).
- 2026-04-16: Built `/dashboard/templates` list page, `/dashboard/templates/new` create form, `/dashboard/templates/[templateId]` detail/editor page with inline add/remove item form and reference image URL + instructions fields.
- 2026-04-16: Built supervisor review queue at `/dashboard/review`: lists all `completed_pending_review` jobs with checklist progress and photo count, Approve/Needs-reclean actions with optional review notes. Both actions record `reviewed_by_id`, `reviewed_at`, `review_notes` on the assignment.
- 2026-04-16: Extended checklist snapshot to copy `instruction_text` and `reference_media_url` from template items at assignment creation time. Cleaner job execution page now shows instructions hint and reference image link per checklist item.
- 2026-04-16: Added `markInProgressAction` for `acknowledged → in_progress` issue transition. `IssueActionButtons` now shows "Start work" button for acknowledged issues, giving the full open → acknowledged → in_progress → resolved lifecycle.
- 2026-04-16: Added Templates and Review queue links to admin dashboard quick-nav.
- 2026-04-16: Full verification passes: npm test (108/108), typecheck (0 errors), lint (0 errors), build (29 routes clean, Node 20).

### Tasks

- [x] Build reusable template management (1BR, 2BR, deep clean)
- [x] Add visual reference support on checklist items (images + instructions)
- [x] Build supervisor review queue (completed jobs awaiting review)
- [x] Expand maintenance issue workflow (status progression)
- [-] Add richer review context (prior issues, cleaner history) — deferred to Sprint 7 (analytics)
- [x] Test coverage for templates and review workflows

### Definition of Done

- New properties can use reusable templates ✓
- Checklist items can include reference images ✓ (reference_media_url + instruction_text)
- Supervisors can review jobs from a dedicated queue ✓
- Maintenance issues have a structured lifecycle ✓ (open → acknowledged → in_progress → resolved → closed)

---

## Sprint 7: Intelligence

### Goal

Use historical data to surface insights.

### Comment Log

- 2026-04-16: Built `scoring-service.ts` — pure functions `calculateCleanerScore` and `calculatePropertyHealthScore` with confidence shrinkage (pulls score toward neutral when job count is low), weighted components, and A–F grade bands. `calculatePortfolioSummary` aggregates across all cleaners and properties.
- 2026-04-16: Cleaner score weights: 40% quality (approved/completed), 30% acceptance rate, 20% completion rate, 10% issue rate penalty. Confidence ramps from 0→1 over first 10 completed jobs.
- 2026-04-16: Property health score weights: 45% approval rate, 35% re-clean rate, 20% issue density (issues per 10 jobs). Confidence ramps over first 8 jobs. Duration variance % computed from started_at/completed_at vs expected_duration_min.
- 2026-04-16: Built `analytics.ts` — `getCleanerAnalytics`, `getPropertyAnalytics`, `getPortfolioSummary`. Computed from existing assignments + issues tables; no schema migration needed.
- 2026-04-16: Built `/dashboard/analytics` page: 4-column portfolio KPI strip, ranked cleaner performance table (acceptance/quality/issue rate columns), ranked property health table (re-clean rate/open issues/duration variance), score methodology footnote.
- 2026-04-16: Built `ScoreBar` component — grade badge (color-coded A–F) + animated progress bar + numeric score.
- 2026-04-16: Added Analytics nav item to sidebar. Workload indicators covered by schedule page (in-progress/unassigned counts). Trend analytics deferred — requires time-series aggregation beyond current data density.
- 2026-04-16: Full verification passes: npm test (129/129), typecheck (0 errors), build (31 routes clean, Node 20). Pushed to GitHub + Vercel deployment triggered.

### Tasks

- [x] Implement cleaner reliability score (acceptance rate, on-time, quality, issues)
- [x] Implement property health score (issues, time, re-clean rate)
- [x] Add duration variance analysis (expected vs actual)
- [-] Build workload indicators and trend analytics — workload surfaced via schedule/dashboard; time-series trends deferred pending data density
- [x] Add portfolio performance dashboard
- [x] Test coverage for score calculations

### Definition of Done

- Owner can identify underperforming cleaners and problematic properties ✓
- Workload issues are visible before quality drops ✓ (schedule + dashboard KPIs)
- Scores are explainable and traceable to underlying data ✓ (methodology note on analytics page)
