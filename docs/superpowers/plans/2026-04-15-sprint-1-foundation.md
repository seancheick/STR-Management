# Sprint 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Airbnb Ops Portal foundation so Sprint 1 can proceed on a runnable Next.js + Supabase base with auth wiring, core schema, RLS, and a tested assignment state engine.

**Architecture:** Build a single Next.js App Router app in this workspace, keeping the planning docs at repo root and application code under `src/`. Add Supabase SSR utilities and middleware up front so auth and route protection patterns are consistent. Treat the database schema and centralized assignment status engine as first-class foundation pieces because later Sprint 1 flows depend on them.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui config, Supabase Auth/Postgres/Storage, Vitest, Zod.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `components.json`

- [ ] Define project metadata, scripts, and dependencies for Next.js, Supabase, Tailwind, validation, and tests.
- [ ] Add TypeScript, Next.js, PostCSS, and ESLint base configuration.
- [ ] Add `components.json` so shadcn/ui components can be added later without reworking aliases.

### Task 2: App Shell and Utilities

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/(auth)/sign-in/page.tsx`
- Create: `src/app/(admin)/dashboard/page.tsx`
- Create: `src/app/(cleaner)/jobs/page.tsx`
- Create: `src/components/providers/query-provider.tsx`
- Create: `src/components/auth/sign-in-form.tsx`
- Create: `src/components/ui/button.tsx`
- Create: `src/lib/utils.ts`
- Create: `src/lib/env.ts`

- [ ] Create a minimal landing page plus initial admin and cleaner route groups.
- [ ] Add a query provider and a small sign-in form shell so auth wiring has a concrete entry point.
- [ ] Add shared utility and environment parsing helpers.

### Task 3: Supabase Auth Foundation

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/lib/auth/config.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/middleware.ts`
- Create: `src/app/auth/callback/route.ts`

- [ ] Add browser and server Supabase client factories using `@supabase/ssr`.
- [ ] Add middleware-based session refresh and route gating for auth-protected areas.
- [ ] Add reusable auth helpers for session lookup and route-role checks.

### Task 4: Core Schema and RLS

**Files:**
- Create: `supabase/migrations/20260415150000_sprint_1_foundation.sql`
- Create: `supabase/seed.sql`

- [ ] Create the core Sprint 1 tables: `users`, `properties`, `checklist_templates`, `checklist_template_items`, `assignments`, `assignment_checklist_items`, `assignment_photos`, `assignment_notes`, `assignment_events`, and `audit_logs`.
- [ ] Add enums, timestamps, indexes, photo limits support fields, and helper trigger/function scaffolding.
- [ ] Add RLS enablement and baseline policies for owner/admin/supervisor/cleaner access.
- [ ] Add small seed data to support local development once Supabase is linked.

### Task 5: Centralized Status Engine

**Files:**
- Create: `src/lib/domain/assignments.ts`
- Create: `src/lib/services/assignment-status-engine.ts`
- Create: `src/lib/validations/assignment-status.ts`
- Create: `tests/unit/assignment-status-engine.test.ts`

- [ ] Write failing unit tests for allowed and blocked assignment transitions.
- [ ] Implement the minimal state machine and validation helpers to satisfy the tests.
- [ ] Keep the engine framework-agnostic so route handlers and services can reuse it later in Sprint 1.

### Task 6: Verification and Tracking

**Files:**
- Modify: `SPRINT_TRACKER.md`
- Create: `.env.example`

- [ ] Add environment variable examples for Next.js + Supabase.
- [ ] Run install, lint, and tests to verify the scaffold.
- [ ] Update `SPRINT_TRACKER.md` to mark the completed Sprint 1 foundation task(s) only after verification.
