# Contractors and owner cleaning spending

The cleaner/payee identity must outlive an optional login. Introduce `cleaners`
as the canonical payee table, preserving every existing cleaner ID. Store optional
`user_id` linking to the existing authenticated `users` profile. Contractor rows
have no user_id, name required, phone/email optional, details and active status.
No synthetic login accounts. Existing staff profiles sync contact/role/active
changes into their cleaner record. All cleaner foreign keys target this table.

Assignments, rates, extras, completion, ledger and payments continue to use one
cleaner ID. Contractors are direct assigned or host-completed; they cannot accept
requests without access. Optional later invitation links a new auth user to the
original cleaner ID, preserving all historical work and payment rows. Tenant and
cleaner RLS authorize using user_id lookup, not email matching. Notification
recipients remain actual auth profiles, never contractor/payee IDs.

Team offers Add contractor (no app access), contact/details editing, and an explicit
Invite to app action. Cleaner selection labels identify no-access contractors.
All cleaners retain the existing ledger and reports and adjustable job prices.

Owner dashboard adds current-year completed cleaning costs, money paid, outstanding
balance and current-month costs. A detailed spending report allows year selection,
monthly breakdown, payee totals, and CSV. All calculations use existing shared
financial statement entries, deduplicating reconciled jobs, committed report
snapshots and canonical payments. Costs and cash payments are separate measures;
no unknown historical charges are invented.

Verification: migration suite with cross-tenant and linked-contractor access cases,
assignment/payment flow with no-login contractor, stable history through linking,
financial totals with duplicate report/job inputs, month/year boundaries, CSV,
production build/typecheck/lint, live owner UI smoke. No real invitations or
contractor financial entries are submitted as tests.
