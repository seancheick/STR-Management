# Airbnb Ops Portal — System Architecture

Date: 2026-04-15
Source: `Airbnb_Management_Plan.md`

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | Next.js App Router + TypeScript | Single app for admin + cleaner PWA |
| UI | Tailwind CSS + shadcn/ui | Shared component system |
| State/Data | TanStack Query + React Hook Form + Zod | Server state, forms, validation |
| PWA | Service worker for install + push | Online-only, no offline mutation queue |
| Auth | Supabase Auth | Email/password, magic link |
| Database | Supabase Postgres | Primary relational store |
| File Storage | Supabase Storage | Assignment photos, checklist reference media |
| Realtime | Supabase Realtime | Live dashboard + assignment updates |
| Background Jobs | Vercel Cron + Edge Functions | iCal sync, reminders, SLA checks |
| Notifications | Web Push primary, Resend email, Twilio SMS fallback | |
| Deployment | Vercel + Supabase | |

---

## App Structure

```
airbnb-ops/
├── app/
│   ├── (auth)/              # Sign-in, invite acceptance
│   ├── (admin)/             # Owner: dashboard, properties, team, assignments, reports
│   ├── (cleaner)/           # Cleaner: today's jobs, execution, history
│   ├── api/                 # Route handlers + cron endpoints
│   └── layout.tsx
├── components/              # Shared UI components
├── lib/
│   ├── services/            # Business logic
│   │   ├── assignment-service.ts
│   │   ├── completion-validator.ts
│   │   ├── payout-service.ts
│   │   └── ...
│   ├── queries/             # DB query helpers
│   ├── validations/         # Zod schemas
│   └── auth/                # Auth helpers, guards
├── supabase/
│   ├── migrations/          # SQL schema migrations
│   └── seed.sql             # Dev/test seed data
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── public/                  # PWA manifest, icons
```

---

## High-Level Architecture

```
┌─────────────┐  ┌──────────────┐  ┌───────────────┐
│ Admin Web   │  │ Cleaner PWA  │  │ Supervisor UI │
└──────┬──────┘  └──────┬───────┘  └───────┬───────┘
       │                │                   │
       └────────────────┼───────────────────┘
                        │
                 ┌──────▼──────┐
                 │  Next.js    │
                 │  App Router │
                 └──────┬──────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
   ┌──────▼──────┐ ┌───▼────┐ ┌─────▼──────┐
   │  Supabase   │ │ Supa   │ │  Supabase  │
   │  Postgres   │ │ Auth   │ │  Storage   │
   └──────┬──────┘ └────────┘ └────────────┘
          │
   ┌──────▼──────┐
   │ Vercel Cron │──→ iCal sync, reminders, SLA checks
   └─────────────┘
```

---

## Data Model

### Users

```sql
users
  id              uuid PK (= auth.users.id)
  email           text NOT NULL
  phone           text
  full_name       text NOT NULL
  role            enum (owner, admin, supervisor, cleaner)
  avatar_url      text
  active          boolean DEFAULT true
  availability    text           -- free-text schedule notes
  created_at      timestamptz
```

### Properties

```sql
properties
  id                          uuid PK
  owner_id                    uuid FK → users.id
  name                        text NOT NULL
  address_line_1              text
  city                        text
  state                       text
  postal_code                 text
  bedrooms                    int
  bathrooms                   int
  default_clean_price         decimal
  difficulty_score            int
  default_cleaner_id          uuid FK → users.id
  primary_checklist_template_id uuid FK → checklist_templates.id
  active                      boolean DEFAULT true
  created_at                  timestamptz
```

### Checklist Templates

```sql
checklist_templates
  id              uuid PK
  owner_id        uuid FK → users.id
  name            text NOT NULL
  template_type   text           -- '1br', '2br', 'deep_clean', 'custom'
  version         int DEFAULT 1
  is_default      boolean DEFAULT false
  created_at      timestamptz

checklist_template_items
  id                  uuid PK
  template_id         uuid FK → checklist_templates.id
  section_name        text
  label               text NOT NULL
  instruction_text    text
  reference_media_url text
  required            boolean DEFAULT true
  sort_order          int
  photo_category      text     -- null = no photo needed
```

### Assignments

```sql
assignments
  id                      uuid PK
  owner_id                uuid FK → users.id
  property_id             uuid FK → properties.id
  cleaner_id              uuid FK → users.id
  assignment_type         text DEFAULT 'cleaning'
  status                  enum (unassigned, assigned, confirmed, in_progress,
                                completed_pending_review, approved,
                                needs_reclean, cancelled)
  ack_status              enum (pending, accepted, declined, expired)
  priority                enum (normal, high, urgent)
  checkout_at             timestamptz
  due_at                  timestamptz
  expected_duration_min   int
  fixed_payout_amount     decimal
  source_type             text     -- 'manual' or 'ical_sync'
  source_reference        text     -- external calendar UID for dedup
  created_by_user_id      uuid FK → users.id
  accepted_at             timestamptz
  started_at              timestamptz
  completed_at            timestamptz
  approved_at             timestamptz
  created_at              timestamptz

assignment_checklist_items
  id                  uuid PK
  assignment_id       uuid FK → assignments.id
  template_item_id    uuid FK → checklist_template_items.id
  completed           boolean DEFAULT false
  completed_by_id     uuid FK → users.id
  completed_at        timestamptz

assignment_photos
  id              uuid PK
  assignment_id   uuid FK → assignments.id
  photo_category  text NOT NULL
  storage_path    text NOT NULL
  captured_by_id  uuid FK → users.id
  captured_at     timestamptz

assignment_notes
  id              uuid PK
  assignment_id   uuid FK → assignments.id
  user_id         uuid FK → users.id
  note_type       text     -- 'general', 'issue', 'restock'
  body            text NOT NULL
  created_at      timestamptz

assignment_events
  id              uuid PK
  assignment_id   uuid FK → assignments.id
  event_type      text NOT NULL
  actor_user_id   uuid FK → users.id
  payload         jsonb
  created_at      timestamptz
```

### Issues

```sql
issues
  id                  uuid PK
  assignment_id       uuid FK → assignments.id
  property_id         uuid FK → properties.id
  issue_type          enum (cleaning, maintenance)
  severity            enum (low, medium, high, critical)
  status              enum (reported, acknowledged, in_progress, resolved)
  title               text NOT NULL
  description         text
  reported_by_id      uuid FK → users.id
  assigned_to_id      uuid FK → users.id
  reported_at         timestamptz
  resolved_at         timestamptz

issue_media
  id              uuid PK
  issue_id        uuid FK → issues.id
  storage_path    text NOT NULL
  caption         text
```

### Inventory

```sql
property_inventory_items
  id              uuid PK
  property_id     uuid FK → properties.id
  name            text NOT NULL
  unit            text
  par_level       int
  current_level   int
  status          enum (ok, low, critical)

restock_requests
  id                  uuid PK
  assignment_id       uuid FK → assignments.id
  property_id         uuid FK → properties.id
  inventory_item_id   uuid FK → property_inventory_items.id
  severity            enum (low, medium, urgent)
  quantity_requested  int
  status              enum (requested, fulfilled, cancelled)
```

### Inspections

```sql
inspections
  id                  uuid PK
  assignment_id       uuid FK → assignments.id
  reviewer_id         uuid FK → users.id
  status              enum (pending, completed)
  reviewed_at         timestamptz

inspection_items
  id              uuid PK
  inspection_id   uuid FK → inspections.id
  section_name    text
  result          enum (pass, fail)
  notes           text
```

### Finance

```sql
payout_batches
  id              uuid PK
  owner_id        uuid FK → users.id
  period_start    date
  period_end      date
  status          enum (draft, approved, paid)
  approved_by_id  uuid FK → users.id
  approved_at     timestamptz

payout_entries
  id              uuid PK
  batch_id        uuid FK → payout_batches.id
  cleaner_id      uuid FK → users.id
  assignment_id   uuid FK → assignments.id
  amount          decimal
  status          enum (unpaid, queued, paid)
  paid_at         timestamptz
```

### Platform

```sql
notifications
  id              uuid PK
  owner_id        uuid FK → users.id
  user_id         uuid FK → users.id
  channel         enum (push, sms, email)
  template_key    text
  status          enum (pending, sent, failed)
  sent_at         timestamptz
  payload         jsonb

device_subscriptions
  id              uuid PK
  user_id         uuid FK → users.id
  endpoint        text NOT NULL
  p256dh          text
  auth_key        text
  last_seen_at    timestamptz
  active          boolean DEFAULT true

audit_logs
  id              uuid PK
  owner_id        uuid FK → users.id
  entity_type     text NOT NULL
  entity_id       uuid NOT NULL
  action          text NOT NULL
  actor_user_id   uuid FK → users.id
  metadata        jsonb
  created_at      timestamptz

property_calendar_sources
  id              uuid PK
  property_id     uuid FK → properties.id
  provider        text     -- 'airbnb', 'vrbo'
  ical_url        text NOT NULL
  sync_enabled    boolean DEFAULT true
  last_synced_at  timestamptz
```

---

## Status Machine

### Assignment Status Transitions

```
                 ┌──────────┐
                 │unassigned│
                 └────┬─────┘
                      │ assign cleaner
                 ┌────▼─────┐
            ┌────│ assigned  │────┐
            │    └────┬──────┘    │
    declined│         │ accept    │ expired
            │    ┌────▼─────┐    │
            │    │ confirmed │    │
            │    └────┬──────┘    │
            │         │ start     │
            │    ┌────▼──────┐   │
            │    │in_progress │   │
            │    └────┬───────┘   │
            │         │ complete (requires proof)
            │    ┌────▼───────────────┐
            │    │completed_pending   │
            │    │_review             │
            │    └────┬──────┬────────┘
            │         │      │
            │   approve│    reject
            │    ┌────▼┐  ┌─▼───────────┐
            │    │appro-│  │needs_reclean│
            │    │ved   │  └─────────────┘
            │    └──────┘
            │
            └──→ back to unassigned (reassign)

  Any state → cancelled
```

### Ack Status

```
  pending → accepted
  pending → declined
  pending → expired (via SLA timer)
```

---

## Key Business Rules

1. Assignment CANNOT transition to `completed_pending_review` unless all required checklist items are completed AND all required photo categories have uploads. Enforced server-side.
2. Job acceptance uses conditional update as optimistic lock: `WHERE status='assigned' AND ack_status='pending'`. Second cleaner gets "already taken."
3. Every user-facing mutation creates an `assignment_event` or `audit_log` entry.
4. All timestamps stored UTC, rendered in user's local time.
5. RLS enforced on all tables. Owner sees all their data, cleaners see only their assignments.
6. Photo uploads: max 10 photos per assignment, max 5MB per file, resize client-side before upload.
7. iCal imports are idempotent — deduplicate by `source_reference` + `property_id`.

---

## Security Model

- Supabase RLS on all tables using `owner_id` or role checks.
- Storage paths: `{owner_id}/{property_id}/{assignment_id}/` for photos.
- Signed URLs for photo access (no public buckets).
- Audit logging on assignment, payout, issue, and role changes.
- Secrets in Vercel/Supabase env config only.

---

## Recommended Indexes

```sql
CREATE INDEX idx_assignments_owner_due_status
  ON assignments (owner_id, due_at, status);

CREATE INDEX idx_assignments_cleaner_due
  ON assignments (cleaner_id, due_at);

CREATE INDEX idx_issues_property_status
  ON issues (property_id, status, severity);

CREATE INDEX idx_payout_entries_cleaner_status
  ON payout_entries (cleaner_id, status);

CREATE INDEX idx_assignment_events_assignment
  ON assignment_events (assignment_id, created_at);

CREATE INDEX idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id, created_at);
```
