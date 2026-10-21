# Cleaning scope corrections implementation plan

Goal: preserve booked scope, correct actual cleaning scope atomically, maintain financial history and expose one owner/admin action to UI and agents.

Architecture: assignment stores an explicit cleaning scope override and corrected total; immutable correction receipts keyed by request UUID record before/after, reason and actor. Unlocked pay updates in place with audit. Locked financial history retains original charges and creates a separate signed pay adjustment. Existing booking/source IDs and completion evidence stay unchanged. Sync must preserve override. All UI/query consumers use shared scope resolution. Finance adds adjustment exactly once.

- [x] Database migration and security/regression SQL tests: tenant/auth guards, same unit validation, idempotency, approved states, locked history adjustment, preserve checklist evidence, block sync overwrite.
- [x] Consumer/query integration: scope-aware labels/calendar placement, canonical finance and reports plus linked adjustment.
- [x] Shared correction server action, UI preview/confirmation, MCP/REST tool generated from shared tool registry.
- [x] Unit/SQL tests, build, typecheck, lint and independent diff review.
- [x] Apply migration, correct Anitza October 13 once with receipt, verify original booking retained, 3-bedroom scope/$120, financial delta and sync persistence, deploy main and browser/API verification.

Acceptance: correction receipt 53cd5889-96f0-467d-a51a-c52abf8fc78e applied once through the production agent API; replay retained one receipt. Original booked identity and completion evidence preserved. Owner drawer, cleaner job/pay views and statement CSV show actual scope. Financial correction increased the account by exactly $30; existing payment records unchanged. Reconciled-cutoff detection is shared between preview and apply.
