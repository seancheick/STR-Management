# Airbnb Ops Portal

> A **web-first, proof-based** operations portal for Airbnb turnovers. Single operator, real cleaning team, zero missed jobs.

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb?logo=react">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres%20%7C%20Auth%20%7C%20Storage-3ecf8e?logo=supabase">
  <img alt="Turbopack" src="https://img.shields.io/badge/Bundler-Turbopack-black">
  <img alt="Deployed" src="https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel">
  <img alt="Node" src="https://img.shields.io/badge/Node-%E2%89%A520.9-339933?logo=nodedotjs">
</p>

---

## Why this exists

Running 5–15 short-term rentals with a cleaning team breaks down on the same three failures: **missed turnovers, no proof of work, and no single source of truth**. This portal fixes that with server-enforced completion rules, a cleaner-first mobile flow, and live operational visibility.

- **Proof-based completion** — no job closes without required checklist items and photos.
- **Race-safe acceptance** — optimistic locking via conditional `UPDATE` prevents double-accept.
- **Real-time dashboard** — supervisor and owner see status, issues, and SLA risk as it happens.
- **Automation first** — iCal sync, SLA reminders, and payouts run on cron, not memory.

---

## Built for speed

Performance is a feature, not an afterthought. Every layer is chosen for **low latency and low overhead**:

| Layer | Choice | Why it's fast |
|-------|--------|---------------|
| **Bundler** | Next.js 16 + **Turbopack** | Rust-based, incremental — sub-second HMR, multi-second prod builds |
| **Rendering** | React 19 Server Components + Server Actions | Zero client JS for most admin routes; no API round-trips for mutations |
| **Data layer** | Supabase Postgres + **covering indexes** on hot queries | `O(log n)` reads on today/at-risk/unassigned dashboards |
| **Concurrency** | Conditional `UPDATE ... WHERE status=? AND ack_status=?` | Race-free accept with no row-level locking or transactions |
| **Schema writes** | Assignment creates **snapshot** checklist items from template | `O(1)` execution reads — no joins across templates on the cleaner hot path |
| **Validation** | Zod at boundary + server-side `completion-validator.ts` | Proof rules evaluated once, authoritatively; never UI-only |
| **Auth** | Supabase SSR with middleware session refresh | Single round-trip per request; no client-side token juggling |
| **Storage** | Direct-to-Supabase path `{owner}/{property}/{assignment}/` | No server proxy; upload is one network hop |
| **Scheduling** | Vercel Cron → Edge Functions | Global edge, cold-start-free for sub-minute triggers |
| **Delivery** | Vercel CDN + PWA service worker | Installable, instant repeat visits, push-ready |

**Key algorithmic choices**

- **Status engine** (`assignment-status-engine.ts`) — a single pure function maps `(status, ackStatus, action) → nextState`. All transitions flow through it. No scattered `if` branches.
- **Optimistic lock on accept** — the conditional `UPDATE` acts as a compare-and-swap. No advisory locks, no retry loops, no deadlocks.
- **Template snapshot at assign time** — checklist items are materialized on creation. Hot-path reads (cleaner execution page) touch one row set instead of joining across templates and updates.
- **Proof gate server-side** — `completeJobAction` runs the validator before any status transition. UI is advisory; server is authoritative.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 App Router + TypeScript 5.8 |
| UI | Tailwind v4 + shadcn/ui + Radix primitives + lucide-react |
| State / Forms | TanStack Query v5 + React Hook Form + Zod |
| Auth | Supabase Auth (email + magic link) |
| Database | Supabase Postgres with RLS on every table |
| Storage | Supabase Storage (photos, checklist media) |
| Realtime | Supabase Realtime subscriptions |
| Jobs | Vercel Cron + Edge Functions |
| Notifications | Web Push (primary) · Resend email · Twilio SMS (fallback) |
| Tests | Vitest |
| Deploy | Vercel + Supabase |

---

## Quick start

```bash
# 1. Install
npm install

# 2. Environment (see .env.local template)
#    NEXT_PUBLIC_SUPABASE_URL
#    NEXT_PUBLIC_SUPABASE_ANON_KEY
#    SUPABASE_SERVICE_ROLE_KEY
#    NEXT_PUBLIC_VAPID_PUBLIC_KEY
#    VAPID_PRIVATE_KEY
#    CRON_SECRET

# 3. Apply migrations to your Supabase project
npx supabase db push

# 4. Dev
npm run dev           # next dev --turbopack

# 5. Verify
npm test              # vitest
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run build         # production build
```

Node **≥ 20.9** (pinned via `.nvmrc`).

---

## Project structure

```
src/
├── app/
│   ├── (auth)/              Sign-in, callback, invite accept
│   ├── (admin)/dashboard/   Owner: properties, assignments, team, templates,
│   │                        calendar, issues, payouts, notifications, review
│   ├── (cleaner)/jobs/      Cleaner PWA: today's jobs, execution, history
│   └── api/                 Cron endpoints + push registration
├── components/              Shared UI (shadcn), assignment + issue widgets
├── lib/
│   ├── services/            assignment-service, status-engine,
│   │                        completion-validator, payout-service,
│   │                        template-service, issue-service
│   ├── queries/             Typed Supabase query helpers
│   ├── validations/         Zod schemas
│   ├── auth/                SSR helpers + route guards
│   ├── ical/                Airbnb/VRBO feed parsing
│   └── notifications/       Push + SMS + email dispatch
├── supabase/migrations/     6 sprint-scoped SQL migrations
└── tests/                   Vitest unit + integration
```

---

## Sprint status

| Sprint | Goal | Status |
|--------|------|--------|
| 1 | MVP — auth, properties, assignments, proof-based completion | Complete |
| 2 | Exceptions — issues, re-cleans, inventory | Complete |
| 3 | iCal sync — Airbnb/VRBO import, dedup, warnings | Complete |
| 4 | Notifications — Web Push, SLA automation, history | Complete |
| 5 | Payouts + reports — batches, statements, CSV/PDF export | Complete |
| 6 | Templates + supervisor — reusable checklists, review queue | Complete |
| 7 | Intelligence — reliability, property health, analytics | Next |

Detailed task-level tracking in [`SPRINT_TRACKER.md`](./SPRINT_TRACKER.md).

---

## Data model (high level)

```
users ──┐
        ├── properties ── checklist_templates ── checklist_template_items
        │       │
        │       └── assignments ── assignment_checklist_items (snapshot)
        │               │       ├── assignment_photos
        │               │       ├── assignment_events
        │               │       └── assignment_notes
        │
        └── issues · restock_requests · inventory_items
                payout_batches · payout_statements
                ical_feeds · ical_events · notifications · push_subscriptions
```

Full schema + RLS model: [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md).

---

## Non-negotiable invariants

1. **Server validates completion.** `completion-validator.ts` runs before every `assigned → completed_pending_review` transition.
2. **RLS on every table.** No table ships without a policy. `owner_id` scopes all owner data.
3. **Status machine is the only path.** UI never sets `assignment.status` directly — it calls the engine.
4. **Photos are path-scoped.** Storage keys are `{owner_id}/{property_id}/{assignment_id}/...` and orphan files are swept on insert failure.
5. **Dates are UTC in the DB**, rendered local in the UI.
6. **No offline mutation queue.** Online-only with explicit connectivity UX.

---

## Testing

```bash
npm test              # vitest run
npm run test:watch    # vitest watch
```

Tests cover the status engine, completion validator, property form parsing, and assignment service contract. Integration tests run against Supabase locally.

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [`INDEX.md`](./INDEX.md) | Navigation hub for everything in this repo |
| [`Airbnb_Management_Plan.md`](./Airbnb_Management_Plan.md) | Product PRD — vision, users, core principles |
| [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md) | Tech stack, schema, status machine, business rules |
| [`ROADMAP.md`](./ROADMAP.md) | 7-sprint build order and out-of-scope list |
| [`SPRINT_TRACKER.md`](./SPRINT_TRACKER.md) | Live task status |
| [`ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md) | ADRs with context and consequences |
| [`HANDOFF.md`](./HANDOFF.md) | Session handoff notes |

---

## License

See [`LICENSE`](./LICENSE).

---

<p align="center">
  Built by <strong>B&amp;Br Technology</strong>
</p>
