# TurnFlow

**Bookings in. Proof out. Cleaners paid.**

TurnFlow turns every Airbnb, VRBO and Booking.com checkout into a cleaning job. It holds that job to a checklist and photo proof, and ends with a payout report your accountant can read. It's built by a host who runs short-term rentals and got tired of finding out about a missed clean when the next guest arrived.

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb?logo=react">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres%20%7C%20Auth%20%7C%20Storage-3ecf8e?logo=supabase">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss">
  <img alt="Vercel" src="https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel">
  <img alt="Tests" src="https://img.shields.io/badge/tests-201%20unit%20%2B%2012%20RLS-2ea44f">
</p>

---

## The problem it kills

If you run a handful of rentals with your own cleaners, you know these:

- A cleaner ghosts a Sunday checkout, and you find out when the guest does.
- A guest complains, and you have no photo proving the unit was turned over.
- Every turnover is a text thread, and tax season means rebuilding a 1099 from eight months of messages.

TurnFlow replaces the text threads with one system. The calendar creates the work, the server refuses to close a job without proof, and the money adds itself up.

## How a turnover flows

```
 Airbnb / VRBO / Booking iCal
            │  synced daily, or the moment you hit "Sync now"
            ▼
   Cleaning job created ──► assigned to a cleaner ──► accept · decline with reason · "running late"
            │                                                      │
            │  guest changes dates → job moves, cleaner is told    ▼
            │  booking cancelled  → job cancelled, cleaner is told   checklist + before/after photos
            ▼                                                      │
   Supervisor review ◄─────────────────────────────────────────────┘
       approve · or send back for a re-clean
            ▼
   Payout batch ──► printable statement ──► year-end 1099 export
```

## What each person gets

**Owners and admins** plan on a desktop:
- **Today at a glance:** unassigned jobs, jobs at risk, and turnovers under 6 hours between guests.
- **One schedule and calendar** across every property, with booking stripes and cleaning jobs together.
- **Property health and cleaner reliability scores,** plus acceptance, completion, approval and issue rates.
- **Issues, restocks and inventory** per property, and recurring tasks for deep cleans and filter changes.
- **Payouts** in batches, with per-cleaner statements, CSV schedule export and a 1099-NEC view per contractor.
- **A private calendar feed** of upcoming turnovers for Google or Apple Calendar. You can regenerate it at any time.

**Supervisors** work a review queue. They see each job's checklist and photo evidence, then approve it or flag a re-clean.

**Cleaners** use an installable mobile web app with big tap targets:
- Today's jobs, the upcoming schedule and history.
- Door codes and property notes on the job they're working.
- A chat thread on every job, plus push notifications for new jobs, 24-hour reminders, date changes and cancellations.
- Their own earnings and pay history.

## The rules the server enforces

These aren't UI hints. The database and server code enforce them, so a crafted request can't get around them.

| Rule | Where it lives |
|---|---|
| A job can't be submitted until required checklist items and photos are in | `src/lib/services/completion-validator.ts` |
| Every status change goes through one state machine | `src/lib/services/assignment-status-engine.ts` |
| Two cleaners can't both accept the same job | A conditional update that only succeeds if the job is still open |
| Each host's data is invisible to every other host | Row-level security on every table, scoped by tenant |
| Nobody can raise their own role, change tenants, or reactivate themselves | A database trigger on `users`, proven by `tests/db/` |
| A deactivated user loses database access, not just the UI | Role helpers return nothing for inactive users |
| Calendar URLs must be public https | `src/lib/ical/url-guard.ts`, re-checked on every redirect |
| A feed only cancels jobs it created | Each imported job records its calendar source |

## Keeping it real: what TurnFlow is not

- **Not a channel manager.** It reads your listing calendars through iCal. It doesn't send guest messages, set prices or push availability back to Airbnb.
- **Not instant.** The cron runs calendar sync once a day, and you can sync on demand. Turnovers are planned in days, so that's fine for cleaning, but don't use it to manage availability.
- **Not offline.** The cleaner app needs a connection to submit work.
- **Not for 200 units.** It's built for hosts with roughly 1 to 20 properties who bring their own team.
- **Not auto-dispatch.** A declined job goes back to the open pool with the reason, and you pick the next cleaner.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 App Router, React 19 Server Components and Server Actions, TypeScript |
| UI | Tailwind v4, Radix primitives, lucide icons |
| Forms | React Hook Form and Zod |
| Data | Supabase Postgres with row-level security, Auth and Storage |
| Scheduled jobs | Vercel Cron: calendar sync, reminders, recurring tasks, weekly digest |
| Notifications | Web Push and an in-app inbox |
| Calendar | A dependency-free iCal parser that is time-zone aware per property |
| Tests | Vitest, plus SQL row-security tests on a throwaway Postgres |
| Hosting | Vercel and Supabase |

## Run it locally

```bash
npm install
npm run dev                  # after creating .env.local with the variables below
```

You need Node 20 or newer, and these environment variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
CRON_SECRET          # required in production; cron routes refuse every call without it
```

Apply the database schema to your Supabase project:

```bash
supabase db push
```

## Tests

```bash
npm test             # unit tests: status engine, validator, iCal parsing, sync reconciliation, URL guard, scoring
npm run test:db      # row-security tests: applies every migration to a throwaway Postgres
npm run typecheck
npm run build
```

`npm run test:db` never touches a Supabase project. It starts a temporary local Postgres and applies all 28 migrations. Then it tries the attacks: privilege escalation, cross-tenant reads, self-reactivation and signup metadata injection. Every attack has to fail.

## Project layout

```
src/
├── app/
│   ├── (auth)/        sign in, sign up, password reset
│   ├── (admin)/       owner, admin and supervisor dashboard
│   ├── (cleaner)/     cleaner mobile app: jobs, schedule, inbox, pay
│   └── api/           cron jobs, push subscription, calendar feed, CSV export
├── components/
└── lib/
    ├── services/      status engine, completion validator, payouts, scoring
    ├── ical/          parser, sync, reconciliation, URL guard
    ├── notifications/
    ├── queries/
    └── auth/
supabase/migrations/   28 migrations
tests/unit/            Vitest
tests/db/              row-security tests
```

## Docs

| Doc | What's in it |
|---|---|
| [`Airbnb_Management_Plan.md`](./Airbnb_Management_Plan.md) | Product vision, users and principles |
| [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md) | Schema, status machine, business rules |
| [`ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md) | Why things are built the way they are |
| [`docs/MULTI_TENANCY_HANDOFF.md`](./docs/MULTI_TENANCY_HANDOFF.md) | How tenant isolation works |
| [`ROADMAP.md`](./ROADMAP.md) and [`SPRINT_TRACKER.md`](./SPRINT_TRACKER.md) | Build history and status |
| [`INDEX.md`](./INDEX.md) | Map of everything else |

## License

MIT. See [`LICENSE`](./LICENSE).

<p align="center">Built by <strong>B&amp;Br Technology</strong>, for hosts who'd rather be hosting.</p>
