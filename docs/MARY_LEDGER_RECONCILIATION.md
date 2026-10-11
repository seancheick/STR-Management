# Mary Carlos Team ledger — October 11, 2026

The owner-supplied January–October ledger is reconciled through October 10.
Mary's existing account (`marycarloston@gmail.com`) matches the supplied team.
Every source running balance was independently recomputed before import.

| Item | Verified total |
|---|---:|
| Cleanings | 132 / $12,345 |
| Extras and adjustments | 5 / $119 |
| Payments and cash retained | 11 / $10,340 |
| Charges less payments | $2,124 due |

All 148 dated entries retain source order, description, and signed amount.
June 4's $1,260 payment, September 19's $80 mattress cash, March's $5
adjustment, May's $50 extra, and October's $25 callback are included.
No October 11 cleaning is added.

## Accounting boundary

`cleaner_accounts.reconciled_through` declares the authoritative history cutoff.
Ledger transactions replace assignment/report payment assumptions through that
local date for that cleaner. Completed jobs after the cutoff continue through
normal assignment/payout workflows. Existing job records and the old Jan–May
report are retained; the report is labelled historical and excluded from current
report totals. Do not infer actual cash receipts from those old paid stamps.

The cleaner Pay page, owner pending-payout total, owner ledger, annual payment
export, quick-pay job list, and batch generator honor this boundary. Other
cleaners retain their existing behavior. The annual export records payments;
it does not allocate lump-sum payments to individual cleanings.

Ledger access is read-only for authenticated users. Mary can read her own
ledger; owner/admin/supervisor access is tenant restricted. Other cleaners,
other owners, and anonymous users cannot read it. Financial changes to this
import currently require a reviewed data import; no ledger-edit form is added.

## Reproduction and checks

Schema: `supabase/migrations/20261011191703_cleaner_account_ledger.sql`.
Idempotent, identity-checked import: `supabase/data/mary-ledger-2026.sql`.
Generator: `node scripts/import-cleaner-ledger.mjs <source.txt> <output.sql>`.
Generator checks every running balance and all final totals before emitting SQL.
Import aborts if persisted entry count or balance does not match.

`tests/unit/cleaner-ledger.test.ts` checks all ten month-end balances, payments,
cent precision, source ordering, credits, and the timezone cutoff.
`tests/db/cleaner-ledger-rls.sql` verifies Mary/owner read access, denied access
for another cleaner and owner, and absence of public read/cleaner write grants.

Browser checks cover Mary's Jobs, Schedule, History, Inbox, Settings and Pay;
expandable payments (including $1,260), mobile/desktop overflow, owner ledger,
owner dashboard balance ($2,199 across cleaners: Mary $2,124 plus another
cleaner $75), and annual payments. No email is sent and no password
is changed to establish inspection sessions.

## Audit fixes

- Replaced misleading “All caught up” wording when money remains in reports.
- Made total due include unpaid included report entries.
- Reconciled incomplete legacy history and replaced inferred paid totals with
  actual payment transactions, without double-counting historical jobs.
- Removed a non-working SQL-subquery string from the dashboard payout query;
  exclusions now use explicit assignment IDs and errors no longer become $0.
- Show month opening, charges, payments, closing, and per-entry balance.
- Preserve full payment/adjustment descriptions on narrow screens.
- Added labelled navigation, active-page indication, and a job-history link.
- Paginate ledger reads instead of truncating at the default API row limit.

## Separate existing findings

Supabase security advisors also flag existing security-definer views
`v_exception_counts`, `v_low_inventory`, and `v_pending_recleans`, mutable
function search paths, and callable security-definer functions. These are
outside the ledger change and need a focused permissions review; their notices
alone do not establish exploitable access. No new ledger advisor findings.
The repository also has five existing lint warnings in schedule/recap files.

## Job and Hostex reconciliation — October 11

132 completed offline cleanings are linked one-to-one to their ledger rows. Matched
90 existing jobs and recorded 42 missing jobs. Owner review explicitly records
that these are offline confirmations, without invented cleaner acceptance or
photo evidence. Duplicate/unsupported old jobs are cancelled and their original
rows retained in `ops_reconciliation_audit`. Ledger balance remains $2,124.

Five Hostex feeds replaced the old feeds. Their authenticated URLs are stored
only in the database, never in source control. Initial sync created 13 upcoming
jobs assigned to Mary, with pending acceptance. Old source reservations remain
stored but are excluded from the live calendar.

The five visible configurations remain separate: basement 1 bedroom ($75), each
floor 2 bedrooms ($90), and each floor 3 bedrooms ($120). Physical-unit identity
prevents duplicate cleanings; `listing_property_id` preserves booked configuration
in calendar rows, job labels, notes, checklists and payouts. Rate differences
are retained for both historical and future jobs. Shared-unit next arrival is
computed across both bedroom feeds. Current feeds have no same-day turnovers;
checkout/check-in boundary rendering is covered by tests.

History is newest first, compact and paginated (25 jobs). Terminal historical
offers no longer require accept/decline; fresh cancellation updates still show.
The one-time `longmont-jobs-reconciliation.sql` is an operational snapshot import;
do not replay it after activating replacement feeds, as it archives old future
imports. The original ledger data import remains idempotent.
