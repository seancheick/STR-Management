# Architecture Decisions

Date initialized: 2026-04-15

---

## ADR-001: Single Next.js App, Not Monorepo

- Status: Accepted
- Date: 2026-04-15

### Context

The PRD needs an admin web app and a cleaner PWA. Codex originally proposed a monorepo with 8 packages (apps/web, apps/jobs, packages/domain, packages/db, packages/ui, packages/validations, packages/integrations, packages/notifications).

### Decision

Use a single Next.js App Router application with a flat folder structure. Admin and cleaner experiences are route groups within one app.

### Consequences

- Zero tooling overhead (no turborepo, no pnpm workspaces).
- Shared auth, components, and deployment in one place.
- If the app grows beyond ~50 routes, consider extracting shared packages.

---

## ADR-002: Simple Users Table With owner_id For Future Multi-Tenant

- Status: Accepted
- Date: 2026-04-15

### Context

The product serves a single operator today. Codex proposed a 3-table identity model (organizations → organization_members → profiles) for multi-tenant SaaS from day 1.

### Decision

Use a single `users` table (id synced from Supabase Auth, email, phone, name, role enum, active). Add `owner_id` FK on `properties` and `assignments` so tenant scoping can be added later without migrating live data.

### Consequences

- Every query is simpler — no org join on every read.
- `owner_id` is cheap insurance for future multi-tenant migration.
- When/if SaaS is needed: add `organizations` table, rename `owner_id` to `org_id`.

---

## ADR-003: Assignments With Task Types, Not Cleaning-Only Jobs

- Status: Accepted
- Date: 2026-04-15

### Context

The PRD starts with cleaning but expands to inspection, restock, and maintenance tasks.

### Decision

Use `assignments` as the main operational record and support child `assignment_tasks` for cleaning, restock, inspection, and maintenance work.

### Consequences

- Data model supports expansion without renaming core concepts.
- UI stays centered on one job record per turnover.
- Service logic must handle both assignment-level and task-level status.

---

## ADR-004: Server-Side Completion Proof Validation

- Status: Accepted
- Date: 2026-04-15

### Context

The PRD's core non-negotiable: no job can complete without proof (checklist + photos).

### Decision

Completion validation lives in a central service and database-backed state machine. UI checks alone are not sufficient. This is Sprint 1, not deferred.

### Consequences

- Prevents bypassing proof via stale clients or direct API calls.
- Checklist templates and photo requirements must be explicit data from day 1.
- Adds implementation work to Sprint 1, but the product is meaningless without it.

---

## ADR-005: Background Jobs Via Vercel Cron Initially

- Status: Accepted
- Date: 2026-04-15

### Context

The PRD specifies Trigger.dev for iCal sync, reminders, and exports. Vercel has built-in cron jobs that cover initial needs with zero extra infrastructure.

### Decision

Start with Vercel Cron + Edge Functions for scheduled work (iCal sync, reminders, SLA checks). Migrate to Trigger.dev when jobs need retry logic, chaining, or exceed Vercel timeouts.

### Consequences

- Zero extra dependencies for Sprint 1-4.
- 60s timeout on Hobby plan, 300s on Pro — sufficient for initial job sizes.
- Must evaluate before Sprint 5 (payouts) whether Vercel Cron has adequate reliability.

---

## ADR-006: Online-Only, No Offline Support

- Status: Accepted
- Date: 2026-04-15

### Context

Offline-first PWA (mutation queues, idempotency keys, conflict resolution) adds significant complexity. The operator confirmed cleaners have adequate connectivity.

### Decision

Build as a normal PWA (installable, push notifications, responsive) without offline mutation queuing. Define failure UX for connectivity loss (show retry prompt, don't silently fail).

### Consequences

- Removes ~40% of Sprint 2 complexity.
- Must define clear error states when connectivity drops mid-action.
- Can add offline queue later if cleaners report real connectivity issues.
