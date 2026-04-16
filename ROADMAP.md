# Airbnb Ops Portal — Delivery Roadmap

Date: 2026-04-15
Source: `Airbnb_Management_Plan.md`

---

## Build Order

The build sequence matters. Later features depend on earlier ones being stable.

```
Sprint 1: MVP (Foundation + Proof)
    ↓
Sprint 2: Exceptions (Issues + Re-cleans + Inventory)
    ↓
Sprint 3: iCal Sync + Scheduling
    ↓
Sprint 4: Notifications + SLA Automation
    ↓
Sprint 5: Payouts + Reporting
    ↓
Sprint 6: Templates + Supervisor Tools
    ↓
Sprint 7: Intelligence + Analytics
```

---

## Sprint Summaries

### Sprint 1: True MVP

Auth, properties, team, checklist templates, assignments with status engine, completion validator, admin dashboard, cleaner mobile flow. **This is the minimum product that enforces proof-based completion.**

### Sprint 2: Exceptions

Issue reporting (cleaning vs maintenance), re-clean workflow, inventory tracking, inspection baseline. Makes the product usable under real-world stress.

### Sprint 3: iCal Sync

Airbnb/VRBO calendar ingestion, idempotent imports, conflict and overload warnings. Eliminates manual assignment creation.

### Sprint 4: Notifications + SLA

Push notification registration, Vercel Cron reminders (T-24h, T-2h), acceptance SLA monitoring, SMS/email fallback via Twilio + Resend.

### Sprint 5: Payouts + Reporting

Payout batches, cleaner statements, property cost reports, operations reports, CSV/PDF export. Evaluate Trigger.dev if Vercel Cron isn't reliable enough for payout jobs.

### Sprint 6: Templates + Supervisor

Reusable checklist templates (1BR, 2BR, deep clean), visual references on checklist items, supervisor review queue.

### Sprint 7: Intelligence

Cleaner reliability score, property health score, workload analytics, trend dashboards. Requires months of operational data to be meaningful.

---

## Critical Path

```
Auth → Properties → Assignments → Checklist → Photos → Completion Validator
```

Everything else builds on this chain. If this is broken, nothing else matters.

---

## Out of Scope

- Multi-tenant SaaS (owner_id is in place for future migration)
- Native mobile apps
- Offline-first / mutation queues
- AI-based routing optimization
- Vendor marketplace
- Accounting integrations beyond CSV/PDF export
- Trigger.dev (unless Vercel Cron proves inadequate at Sprint 5)
