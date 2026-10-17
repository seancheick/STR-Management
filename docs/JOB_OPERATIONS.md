# Cleaning requests, confirmations and extras

Open a cleaning from Schedule, Assignments or the dashboard. The shared control offers:

- **Send request**: pending until the cleaner accepts or declines. A batch sends one phone alert and individual inbox offers.
- **Direct assign · already agreed**: confirms work agreed by phone or in person. The cleaner is notified and can start without accepting again.
- **Mark completed and approved**: for work already done, with a cleaner selected, a past checkout, a reason and explicit confirmation. Saves an admin audit record; never marks payment as sent.

Future jobs remain unassigned until the host chooses. Existing assignments are not changed by this rollout. Batch planning offers request/direct modes; no future auto-assignment was added.

**Pay & extras** adds a named extra service or purchase reimbursement. The canonical `assignments.fixed_payout_amount` is the TOTAL, including extras. `assignment_extras` stores the individual descriptions and amounts; base cleaning is total minus extras. This preserves the same total in job cards, cleaner Pay, finance summaries and payout reports without adding extras twice. Amounts use cents/decimal arithmetic. Cleaner cards and Pay rows expand to show the breakdown.

Extras mutate via tenant-checked owner/admin RPCs that lock the job. Retries use a stable extra UUID to avoid duplicate charges. Removal subtracts only that extra. The job update triggers the existing realtime refresh. Cleaners can read their own itemization but cannot change pay. Paid/reconciled jobs and jobs with payout-report history lock financial edits, including ownership/date changes that would alter reconciliation. Changes are audited.

The timing/details form preserves a concurrently changed total unless the host explicitly edited the amount; conflicting amount edits require reopening the job. Completion and payment remain separate actions.

Verification covers disposable database tenant/role tests, direct/request/completion paths, completion validation, canonical $75+$10+$10=$95 itemization, retry deduplication, removal, first pay on unassigned jobs, stale forms and report/payment locks. Browser verification must use the user's existing signed-in session; never manufacture sessions for real accounts. Actual phone push delivery still requires an enabled device subscription.

## Payments and running balances

`cleaner_payments` is the canonical record for new money received. Account payments
can be partial or leave a credit and do not transfer money. Job, entry and report
payment actions use the same per-job identity, so paying a report cannot deduct
an already-paid job again. Existing historical ledger entries remain unchanged.
Legacy paid stamps are still honored, except when an active canonical payment
already accounts for that job. Undo preserves a voided payment record.

The shared financial summary now emits one running statement: historical ledger
entries + newer completed-job base fees and extras − older paid-job proof − active
recorded payments. The owner account, cleaner Pay, dashboard totals, report account
balances and ledger CSV use that summary. Report subtotals describe earnings for
the report period, distinct from the current account balance across all periods.

Report forms accept blank/null optional notes and labels, validate real dates,
and reject reversed ranges. Report detail/print/CSV include extras and the actual
account balance. Archived reports remain references and are excluded from live
financial totals. Amount snapshots cannot be edited after report generation;
paid report cancellation and cleaner payment-field tampering are blocked.

## Recording past work and filtering remaining balances

Previous property-local service dates suggest **Record completed work** in the
shared job drawer and new-job form. Today/future dates retain assignment flow.
Host confirmation is required; dates alone never complete a job. Manual work
without a checkout can use its past service date. The same owner RPC writes
completion/approval, notification and audit state. It never records a payment.

The financial summary also returns `jobRemainingAmounts` for both the Assignments
**Work with balance** filter and payout work list. Account payments cover the
reconciled opening debt first, then unpaid completed jobs oldest first (date, ID).
This display allocation does not fabricate job-specific payment stamps. Linked
job payments are deducted once and are not allocated to another job. Reconciled
history stays in the ledger and is excluded from new job charges. Partly covered
jobs link to the cleaner account for the remaining payment instead of offering
another full job payment. Undoing a payment restores the corresponding balance.

The Assignments bulk bar can select past work and record it as completed with a
cleaner and explicit confirmation. `complete_cleaning_batch` delegates each job
to the same owner completion function in one transaction; one invalid/future job
rolls back the whole batch. Completed status labels are shared across host and
cleaner cards, dashboard and calendar.
