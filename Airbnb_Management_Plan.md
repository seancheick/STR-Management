# Airbnb Ops Portal — Complete Enhanced PRD (Production-Ready)

## 1) Product Summary

A **web-first operations portal (PWA)** for managing Airbnb turnovers with your cleaning team. Installable on phones, works offline-first, with push notifications and real-time updates.

**Primary goal:** eliminate missed turnovers and give you real-time operational control with proof, accountability, and simple execution for cleaners.

---

## 2) Users & Roles

### Owner / Admin (You)

* Full control
* Scheduling, payouts, oversight, analytics

### Cleaner / Team

* Mobile-first workflow
* Execute jobs, checklist, photos, report issues

### Supervisor (Optional)

* Review jobs
* Approve / reject completion

---

## 3) Core Principles

* Mobile-first (cleaner experience is priority)
* Zero-friction execution (tap > type)
* Proof-based completion (photos + checklist)
* Fixed payouts (no incentive manipulation)
* Real-time visibility (you always know status)
* Automation over manual work

---

## 4) Tech Stack (2026)

### Frontend

* Next.js (App Router) + TypeScript
* Tailwind + shadcn/ui
* TanStack Query
* React Hook Form + Zod
* PWA (next-pwa or custom SW)

### Backend

* Supabase (Postgres + Auth + Storage + Realtime)
* Server actions / Edge functions

### Jobs

* Trigger.dev

### Notifications

* Push (primary)
* Twilio SMS (fallback)
* Email (Resend)

### Deployment

* Vercel + Supabase

---

## 5) Core Data Model

### Properties

* id, name, address, bedrooms
* default_price
* default_cleaner_id
* difficulty_score (internal)
* airbnb_ical_url
* checklist_template_id

### Users

* id, name, role
* phone, email
* availability_notes
* reliability_score (internal)

### Assignments

* id
* property_id
* cleaner_id
* checkout_date
* cleaning_date
* status
* ack_status
* priority
* fixed_payout_amount
* actual_started_at
* actual_completed_at
* expected_duration_minutes
* cleaner_notes
* issue_count

### Checklist Templates

* property-specific
* required items
* required photo categories

### Checklist Responses

* assignment_id
* item_id
* completed

### Photos

* assignment_id
* category
* file_url

### Issues

* assignment_id
* type
* severity
* description
* status

### Restock Requests

* property_id
* item
* severity

### Payouts

* user_id
* total_amount
* status

### Audit Log

* all actions tracked

---

## 6) Status System

### Assignment Status

* unassigned
* assigned
* confirmed
* in_progress
* completed_pending_review
* approved
* needs_reclean
* cancelled

### Ack Status

* pending
* accepted
* declined
* expired

### Payroll

* unpaid
* queued
* paid

---

## 7) Core Workflows

### A) Assignment Creation

* Manual or iCal
* Auto-assign cleaner
* Send notification
* Cleaner must accept within SLA window
* If not → flagged

### B) Cleaner Execution Flow

* Open job
* Tap "Start Job"
* Complete checklist
* Upload required photos
* Report issues/restock
* Add notes
* Tap "Complete Job"

### C) Completion Validation (STRICT)

Job cannot complete unless:

* All required checklist items done
* Required photos uploaded

### D) Issue Reporting

* Damage
* Missing items
* Heavy mess
* Linen issues

### E) Re-clean Flow

* Owner marks job “needs_reclean”
* New assignment auto-created
* Linked to original

### F) Payout Flow

* Fixed amount per job
* Auto-added to payout batch
* Owner reviews → mark paid

### G) iCal Sync

* Pull checkout dates
* Create assignments
* Prevent duplicates

---

## 8) SLA + Automation Engine

### Acceptance SLA

* Must accept within X hours
* If not → alert + reassign suggestion

### Smart Reminders

* T-24h
* T-2h if not started
* Overdue alerts

### Risk Engine Flags

* No cleaner assigned
* Not accepted
* Not started on time
* Missing photos
* Open urgent issue

---

## 9) Intelligence Layer

### Duration Intelligence

* Track expected vs actual
* Detect slow / rushed jobs

### Cleaner Reliability Score (PRIVATE)

* acceptance rate
* on-time start
* completion quality
* issue frequency

### Property Difficulty Score

* based on issues + time

---

## 10) UI / UX Structure

### Dashboard (Owner)

* Today’s jobs
* At risk
* Unassigned
* Issues
* Payouts

### Daily Ops Feed (NEW)

Live feed:

* job started
* photos uploaded
* issue reported

### Schedule

* Calendar + list
* Filters

### Assignment Page (CORE)

* Checklist
* Photos
* Issues
* Notes
* Timeline

### Timeline View (NEW)

* created → assigned → accepted → started → completed → approved

### Cleaner Mobile View

* Today’s jobs
* Timeline of day
* One-tap actions

---

## 11) Cleaner UX Optimizations

* Large buttons

* Minimal typing

* Quick actions:

  * “All good”
  * “Low supplies”
  * “Heavy mess”

* Camera-first

---

## 12) Multi-Job Day View

Cleaner sees:

* Job 1 → Job 2 → Job 3
* Timeline order

---

## 13) Notifications

### Push

* New job
* Reminder
* Urgent issue

### SMS fallback

* If no app usage

---

## 14) Offline Support

* Cache assignments
* Queue actions
* Sync later
* Conflict resolution (last write wins)

---

## 15) Reporting (Owner)

* Completion rate
* On-time rate
* Avg duration
* Issue rate
* Supply issues

---

## 16) Security

* Role-based access
* Supabase RLS
* Private storage
* Audit logs

---

## 17) Feature Priorities

### Phase 1

* Auth
* Properties
* Team
* Assignments
* Dashboard

### Phase 2

* Cleaner flow
* Checklist
* Photos

### Phase 3

* Issues
* Validation
* Re-clean

### Phase 4

* Notifications

### Phase 5

* iCal sync

### Phase 6

* Analytics

---

## 18) Folder Structure

/apps/web
/features/assignments
/features/properties
/features/team
/features/issues
/features/payouts

---

## 19) Key Non-Negotiables

* Cannot complete job without proof
* Every action logged
* Cleaner flow must be frictionless
* Owner sees risk instantly

---

## 20) Final Product Definition

This is not a cleaning scheduler.

This is a:

**Real-time Airbnb Turnover Operating System**

It ensures:

* No missed cleanings
* Full visibility
* Cleaner accountability
* Operational control

---

## 21) Next Step for Dev

Start with:

1. Auth + roles
2. Assignments system
3. Cleaner mobile flow

Everything else builds on that.

---

❗1. Visual checklist system (VERY important)

Right now:

checklist = text

But top tools do:

checklist = visual instructions
Add:

Each checklist item can include:

reference photo
short instruction

Example:

“Make bed like this” → image

👉 This reduces mistakes massively

❗2. Inspection mode (owner power feature)

You currently have:

review / approve

But missing:

Add:
Inspection mode
View photos like a checklist
Mark pass/fail per section

👉 This replaces you physically checking units

❗3. Inventory tracking (not just reporting)

You have:

restock requests

But missing:

Add:
Track supply levels per property:
toilet paper
paper towels
soap
linens
Status:
OK
Low
Critical

👉 This prevents:

“we ran out” problems
❗4. Maintenance workflow (big one)

Right now:

issues exist
BUT not structured
Add:

Issue types:

cleaning issue
maintenance issue

For maintenance:

assign to vendor later (future)
track status:
reported → acknowledged → fixed

👉 This is what Breezeway does well

❗5. Standard templates (Properly-style)

You have:

checklists per property

Add:

reusable templates:
1BR template
2BR template
deep clean template

👉 Speeds up scaling

❗6. Multi-task jobs (not just cleaning)

Right now:

1 job = cleaning

Add:

job can include:
cleaning
restock
inspection
maintenance

👉 This is how pros operate

❗7. Performance history per property

You track:

issues

Add:

property health score:
issues frequency
avg cleaning time
re-clean rate

👉 Helps you identify bad units

❗8. Cleaner “job history view”

Cleaner should see:

past jobs
notes
issues from last time

👉 Prevents repeated mistakes

❗9. Smart scheduling (light version)

You don’t need AI routing, but:

Add:
conflict warning:
overlapping jobs
workload indicator:
too many jobs in one day

👉 Prevents overbooking cleaners

❗10. Advanced reporting (you asked this — VERY important)

This is a BIG upgrade area.

3) REPORTING SYSTEM (you need this done right)

You said:

“i can print the pay summary of each cleaners per date wanted and per person”

Let’s turn this into a real reporting engine.

📊 Core Reports You MUST Have
1. Cleaner Payout Report

Filters:

date range
cleaner
property

Output:

total jobs
total payout
breakdown per job

👉 Export:

PDF
CSV
Print-ready
2. Cleaner Statement (VERY IMPORTANT)

Per cleaner:

Cleaner: Mary
Period: Jan 1 – Jan 15

Jobs:
- Jan 2 – Basement – $90
- Jan 4 – 2BR – $120
- Jan 7 – Studio – $80

Total: $290
Status: Paid / Unpaid

👉 This is what you send them

3. Property Cost Report
total cleaning cost per property
avg cost per turnover
issue rate
4. Operations Report
jobs completed
on-time %
re-clean count
issue count
5. Supply Usage Report
how often supplies are low
which property needs restocking most
6. Issue Report
damage incidents
maintenance issues
repeat problems
📄 Export System (must-have)

Add:

“Export” button everywhere
formats:
PDF (clean layout)
CSV (for Excel)
print-friendly layout
4) Features to ADD to your PRD (copy/paste for dev)

Add this section:

🔥 Additional Features (Competitive Parity + Advantage)
Visual Checklists
Checklist items support images + instructions
Improves consistency and quality
Inspection Mode
Owner/supervisor can review job visually
Pass/fail per section
Replace physical inspections
Inventory Tracking
Track supply levels per property
Status: OK / Low / Critical
Auto-alert on low supplies
Maintenance Workflow
Separate maintenance issues from cleaning issues
Status tracking: reported → in progress → resolved
Template System
Reusable checklist templates
Apply to new properties instantly
Multi-Task Assignments
Job can include cleaning + inspection + restock
Cleaner sees all tasks in one flow
Property Health Score
Based on:
issues
time
re-cleans
Helps prioritize problem units
Cleaner History View
Cleaner sees past job notes/issues
Reduces repeated mistakes
Smart Scheduling Warnings
Overlapping jobs alert
Overloaded cleaner alert
Advanced Reporting System
Cleaner payout reports
Cleaner statements (printable)
Property cost reports
Issue reports
Supply usage reports
CSV + PDF export