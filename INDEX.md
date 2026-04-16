# Airbnb Ops Portal — Index

Navigation hub for the repo. Everything important lives one link away.

---

## Start here

| Doc | When to open |
|-----|--------------|
| [README](./README.md) | First read — what this project is, how to run it, why it's fast |
| [HANDOFF](./HANDOFF.md) | Picking up a session — latest decisions and current state |
| [SPRINT_TRACKER](./SPRINT_TRACKER.md) | Checking what's done, in-progress, or next |

---

## Product & planning

| Doc | Purpose |
|-----|---------|
| [Airbnb_Management_Plan](./Airbnb_Management_Plan.md) | Product PRD — users, roles, core principles, MVP scope |
| [ROADMAP](./ROADMAP.md) | Sprint-by-sprint build order, out-of-scope list |
| [ARCHITECTURE_DECISIONS](./ARCHITECTURE_DECISIONS.md) | ADRs — every non-trivial architecture call with rationale |

---

## Engineering

| Doc | Purpose |
|-----|---------|
| [SYSTEM_ARCHITECTURE](./SYSTEM_ARCHITECTURE.md) | Tech stack, full schema, status machine, business rules, RLS model |
| [supabase/migrations/](./supabase/migrations/) | 6 sprint-scoped SQL migrations — source of truth for schema |
| [src/lib/services/](./src/lib/services/) | Pure business logic — status engine, completion validator, services |
| [src/lib/queries/](./src/lib/queries/) | Typed Supabase query helpers |
| [src/lib/validations/](./src/lib/validations/) | Zod schemas for all inputs |

---

## Sprint status

| Sprint | Scope | Status |
|--------|-------|--------|
| 1 | MVP — auth, properties, assignments, proof | Complete |
| 2 | Exceptions — issues, re-cleans, inventory | Complete |
| 3 | iCal sync — Airbnb/VRBO ingest | Complete |
| 4 | Notifications — Web Push + SLA cron | Complete |
| 5 | Payouts + reports | Complete |
| 6 | Templates + supervisor review queue | Complete |
| 7 | Intelligence — scores, analytics | Next |

---

## Codebase map

| Area | Path | Owner concept |
|------|------|---------------|
| Admin dashboard | [`src/app/(admin)/dashboard/`](./src/app/(admin)/dashboard/) | Owner / supervisor surface |
| Cleaner PWA | [`src/app/(cleaner)/jobs/`](./src/app/(cleaner)/jobs/) | Mobile execution flow |
| Auth routes | [`src/app/(auth)/`](./src/app/(auth)/) | Sign-in, invite accept |
| API + cron | [`src/app/api/`](./src/app/api/) | iCal sync, SLA, push registration |
| Shared components | [`src/components/`](./src/components/) | shadcn UI + feature widgets |
| Services | [`src/lib/services/`](./src/lib/services/) | Business logic (status engine, validators) |
| Queries | [`src/lib/queries/`](./src/lib/queries/) | Typed DB reads |
| Auth helpers | [`src/lib/auth/`](./src/lib/auth/) | SSR clients, route guards |
| iCal parsing | [`src/lib/ical/`](./src/lib/ical/) | Airbnb / VRBO feed logic |
| Notifications | [`src/lib/notifications/`](./src/lib/notifications/) | Push, SMS, email dispatch |
| Migrations | [`supabase/migrations/`](./supabase/migrations/) | Schema evolution |
| Tests | [`tests/`](./tests/) | Vitest unit + integration |

---

## Quick commands

```bash
npm run dev           # next dev --turbopack
npm test              # vitest run
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run build         # production build
npx supabase db push  # apply migrations to hosted project
```

---

## Invariants (do not violate)

1. Server-side completion validation — never UI-only.
2. RLS on every table. `owner_id` scopes owner data.
3. All status changes go through the assignment status engine.
4. Storage keys: `{owner_id}/{property_id}/{assignment_id}/...`. Sweep orphans on failure.
5. UTC in DB, local in UI.
6. Online-only. No offline mutation queue.

---

Built by **B&Br Technology**
