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
stored; the follow-up below restores past bookings without stale future imports.

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

## Follow-up calendar and payout clarity

The timeline now grows continuously in fourteen-day chunks, preserving visible
positions when earlier dates are prepended. Scrolling no longer replaces the
route with a separate page. Retired-feed cutoffs restore 76 past Airbnb bookings;
older unavailable booking data is not invented, and obsolete futures stay hidden.
Historical reservation bars are labelled accordingly.

Payout report creation is collapsed by default, with cleaner balances first.
Historical reports are a separate collapsed archive. Payment ledger rows use a
subtle green highlight in the shared owner/cleaner component.

Owner payout balances, dashboard pending payouts, cleaner Pay and owner ledger
current totals now read `cleaner-finance.ts`, which owns cutoff, committed-report,
payment-stamp and duplicate-job rules. Draft reports do not own accounting yet.
Historical report detail is labelled reference-only and does not expose payment
mutations. Dashboard and Schedule both render the same calendar and read the same
schedule provider, including bookings, configuration labels, filters and CSV.

Cleaning timing is shared across the dashboard hero/drawer, both calendars and
cleaner cards/details. Checkout is the start-after time (11 AM for current jobs),
not the 3 PM ready target. Actual same-day arrivals show the firm cleaning window;
without one, timing is flexible after checkout and same-day readiness is preferred
for late reservations. Paid reports persist entry payment proof atomically so
cleaner and owner RLS views agree. Calendar range reads paginate past 1,000 rows.

## Calendar event and mobile presentation

Calendar cleanings use one `CleaningCalendarEvent` across timeline and month
views: neutral event surface, cleaner name, time, and plain-text arrival status.
Completed records are not rendered as urgent future turnovers. `CleaningTiming`
is shared with cleaner cards/details and the dashboard drawer, retaining the
canonical timing calculation. Mobile navigation wraps and calendar navigation
has 44-pixel controls; cleaner actions remain 48 pixels. Browser checks covered
320/390/768-pixel cleaner layouts and desktop calendars, plus a browser-only
same-day arrival fixture (no booking data changed).

## Owner-controlled future cleaner selection

At the owner's request, all five listing defaults are now empty and the 13
pending imported future jobs were returned to unassigned. Before-images are in
`ops_reconciliation_audit`; completed/accepted/started jobs are preserved.
Calendar sync reads these empty defaults, so later imports wait for owner choice.

Schedule and Assignments share the collapsed `AssignmentPlanner`: this week
(remaining days through Sunday), next week (Monday–Sunday), next seven calendar
days including today, next three/ten cleanings, or a custom count. Jobs are
previewed with listing/date/rate and individual checkboxes. Assigned jobs are
excluded. Both use the same bulk action, which validates the active cleaner's
organization and only updates still-unassigned jobs. Browser tests assigned a
single temporary job, then a batch, and verified concurrent assignment was
skipped. All temporary jobs were removed. Stale revoked cleaner offers are
hidden, while meaningful cancellation notices remain.

Live saves also uncovered an unrelated invalid server-action export in auth:
move the sign-up initial state into the client form, leaving only async runtime
exports in the server module.


## Batch offers and live responses — October 11, 2026

- Owner-selected batches now assign jobs and create individual inbox offers atomically through `assign_cleaning_batch`. Existing assignments are skipped; retries do not duplicate offers. One push alert links to the inbox for the entire batch.
- Each cleaner can accept or decline on the phone. Decline checks the authenticated assigned cleaner under a row lock, records the reason and clears the assignment in one transaction. Accepted jobs retain their cleaner; declined jobs return to the host's picker.
- Owner and cleaner layouts share authenticated live job invalidation, with focus/reconnection refresh and a 10-second fallback while disconnected. The calendar's loaded viewport responds to that same signal through `getScheduleRange`; stale or cancelled fetches cannot replace newer results. Route cache invalidation refreshes the rest of the portal.
- Notification badges use the same current-offer visibility rules as the inbox, exclude answered or revoked offers, deduplicate delivery copies, and paginate beyond 1,000 rows.
- Calendar cards explicitly show Awaiting response, Accepted, or Declined / choose a cleaner. Inbox cards identify the original bedroom configuration and cleaning date. Push delivery failures do not hide inbox offers or imply that a phone received the alert.
- Live checks used temporary Test Cleaner jobs: two-job batch, mobile accept and decline at 390px, reassign and accept, owner Schedule updates, and an open dashboard calendar moving between pending/accepted/declined without manual reload. Authenticated Realtime subscriptions were verified in the database. Test records and their notifications were removed.
- Database transaction checks verified atomic offers, repeat assignment skips, cleaner acceptance and atomic decline. 284 unit tests passed; production build/typecheck passed; lint has only the two pre-existing warnings.
- Mary has no active push subscription. She must enable Job notifications in her Settings on the phone to receive background alerts. All 13 real future Hostex jobs remain unassigned until Sean chooses a cleaner; historical ledger jobs are unchanged.
