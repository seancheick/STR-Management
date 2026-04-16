# Session Handoff — 2026-04-15

## What Happened

Full engineering review of the Airbnb Ops Portal plan. Codex had generated 8 planning docs (~100KB) with multi-tenant architecture, agent orchestration, offline-first PWA, monorepo, and Trigger.dev. We stripped it all down.

## Decisions Made

| Decision | Choice | Why |
|----------|--------|-----|
| Planning docs | Reduced from 8 → 4 files | Deleted AGENT_EXECUTION_GUIDE, DEBUGGING_PLAYBOOK, LESSONS_LEARNED, PROJECT_OS_INDEX |
| Multi-tenant | Dropped. Added `owner_id` FK instead | Single operator. owner_id is cheap insurance for future SaaS migration |
| User model | Simple `users` table with role enum | No organizations/org_members join tables |
| Offline-first | Dropped entirely | User confirmed online-only is fine |
| Monorepo | Dropped | Single Next.js app, flat folder structure |
| Background jobs | Vercel Cron, not Trigger.dev | Zero extra infra. Evaluate at Sprint 5 for payouts |
| Sprint 1 scope | Merged original Sprint 1+2 | Proof validation (checklist + photos) is in Sprint 1 — it's the core non-negotiable |
| iCal sync timing | Sprint 3 (moved up from 5) | Manual assignment creation is fine for MVP with 5-15 properties |
| Race condition | Conditional UPDATE as optimistic lock | `WHERE status='assigned' AND ack_status='pending'` prevents double-accept |
| Tech stack | Next.js PWA confirmed | PWA beats native for solo operator + future SaaS. Can add native cleaner app later if needed |
| Photo limits | Max 10 per assignment, 5MB each | Prevents storage cost blowup |

## Current File State

```
Airbnb Management/
├── Airbnb_Management_Plan.md    # PRD — untouched, product vision
├── SYSTEM_ARCHITECTURE.md       # Rewritten — schema, tech stack, status machine, business rules
├── ROADMAP.md                   # Rewritten — 7-sprint build order, out of scope list
├── SPRINT_TRACKER.md            # Rewritten — 7 sprints, high-level tasks, no file paths
├── ARCHITECTURE_DECISIONS.md    # Rewritten — 6 ADRs reflecting all review decisions
└── HANDOFF.md                   # This file
```

## What's Next

Start building Sprint 1. First task: scaffold Next.js app + connect Supabase.

## Key Constraints to Remember

- Server-side completion validation — never UI-only
- `owner_id` on properties and assignments
- Status machine defined in SYSTEM_ARCHITECTURE.md — follow it exactly
- All dates UTC, render local
- RLS on every table
- No offline support — define error UX for connectivity loss instead
