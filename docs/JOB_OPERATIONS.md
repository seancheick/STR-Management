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
