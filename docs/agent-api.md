# Agent connections

Production MCP endpoint: https://str-management-sean-cheicks-projects.vercel.app/api/mcp

REST schema: https://str-management-sean-cheicks-projects.vercel.app/api/agent/v1/openapi.json

Create a token under Settings → AI agents. Send `Authorization: Bearer <token>`.
Read tokens expose seventeen read tools; write tokens expose all 36 tools. Revoke a token in Settings to block subsequent requests.

## Server credentials

`AGENT_SIGNING_JWK` is a server-only ES256 private JWK stored as an encrypted Vercel environment variable. It must never be committed or exposed to clients. Supabase trusts the imported key, while the original key remains the current signing key for normal user sessions. The imported agent key is in `previously_used` status and must remain trusted while this integration uses it.

Each tool call checks the agent token and active owner, resolves the Auth user (rejecting banned users), and issues a 60-second JWT with role `authenticated` and the owner's subject. Queries and payment RPCs use the existing RLS and authorization rules. No magic link, email OTP, refresh token, or browser session is generated or modified. The server's verified Auth user is associated only with that call's Supabase client; normal browser clients still call Auth to verify their session.

Missing or revoked signing keys fail closed. To rotate the agent key, import a replacement, update the encrypted environment variable, redeploy and verify live reads/writes, then revoke the previous agent key after outstanding short-lived credentials expire. Do not revoke unrelated user-session or legacy API keys.

Supabase reference: https://supabase.com/docs/guides/auth/jwts

Production is reachable without Vercel SSO so external agents can authenticate with their tokens. Preview deployments retain Vercel protection. Dashboard routes retain application sign-in requirements.

## Verification on October 20, 2026

- Production deployed from `5cf0314`.
- 377 unit tests passed; production build and typecheck passed.
- Real MCP initialization, scoped tool listing, and property read passed.
- Real REST properties, cleaners, calendar, balances and unassigned reads passed.
- Read token write denial, nonexistent-payment rejection through the write path, audit logging, and immediate revocation passed.
- Compared the owner's Auth email-token fingerprints before and after agent calls: unchanged.
- Temporary agent tokens and their test audit entry were deleted after verification. No real schedule or payment was changed.
- Public sign-in, forgot-password, reset-password pages rendered; unauthenticated dashboard redirected to sign-in.

Authenticated browser checks rendered Settings (including AI agents), Schedule, and Payouts with cleaner balances. Lint has one existing unused-component warning in schedule-grid.tsx.

## Correct actual cleaning scope

Use `get_schedule` to match the guest and checkout date, then `get_cleaning_scope` with the returned assignment ID. Its preview returns the original booked listing and stay, current scope/total, same-unit options, financial lock status and prior corrections. Never invent an assignment ID or repeatedly use rescheduling for an approved job.

Call `correct_cleaning_scope` with a new `requestId`, `assignmentId`, target `scopePropertyId`, corrected `total`, `expectedCurrentTotal`, `expectedScopePropertyId` (preview's `currentScopeId`) and explicit `reason`. Reuse the exact request ID and payload when retrying. Read-only tokens cannot apply corrections. If the preview became stale, fetch it again and use a new request ID for the newly reviewed correction.

The booked listing and reservation remain unchanged. Actual cleaning scope controls cleaning labels and calendar placement. Untouched open checklists can be rebuilt from the target template; started/completed evidence stays intact. Correction does not assert that new checklist work was completed.

Uncommitted job pay is corrected in place with an immutable before/after receipt. Paid, reconciled or report-linked charges retain their base amounts and receive a linked signed pay adjustment. A historical report remains a historical report; the separate adjustment appears in statements, balances, spending and statement CSV exports. Existing payment records are preserved. Corrected scope/pay survives later calendar synchronization.

Verify afterward using `get_cleaning_scope`, `get_cleaning` and `get_cleaner_statement`. Agent writes are logged under the token as well as the owner-authorized correction receipt. If Muse cached the OpenAPI schema, refresh its imported schema to discover the new tools.

## Itemized extras

Read `get_job_pay` before changing extras. It returns `canEditExtras` and `editRestriction` along with the effective total and itemized extras. Completed jobs remain editable only until their pay is locked. Corrected-scope jobs use the scope-correction flow for total changes.

`add_job_extra` requires a new request UUID per extra. Repeat exactly the same UUID/payload only to retry. Durable receipts preserve the result even if the job later becomes paid. A delayed retry after removal returns `extraState: "removed"` and does not recreate the charge. Changed payload with a reused ID is refused. `remove_job_extra` is safe to repeat once removal succeeded. New additions/removals respect paid, report, reconciled and scope-correction locks. Amounts must have at most two decimal places; no rounding is performed.

## Dated reconciliation and history

All write-tool requests now require `approved: true` after the owner authorizes the change. Read requests do not require approval. Refresh the generated OpenAPI schema before using new tools.

- `get_cleaner_statement` accepts `dateBasis: "cleanedOn"` (default) or `"checkout"`. `totals` includes the entire imported and current statement's chargedTotal, paidTotal and balance. Each line exposes assignmentId (null for imported/account lines), kind, sourceId and editability with lockReason and correctionPath. Actual dates include cleanedOnSource so late completion confirmation can be distinguished from an owner's date correction. Date presentation never changes reconciliation ownership or money.
- `export_reconciliation` accepts an optional `cleanerId` (every cleaner when omitted) and `dateBasis`. Per cleaner it returns `balance` and `totals` (identical to `get_cleaner_statement`, because both read the same statement calculation), plus `charges`, `payments` and `adjustments`. Each line carries date, amount, `source` (`cleaning`, `job_extra`, `scope_adjustment`, `account_adjustment`, `recorded_payment`, `legacy_paid_mark` or `imported_ledger`), `sourceId`, assignment/payment IDs and editability. Payment lines include the bank `reference` and `verified` (null for imported or legacy paid marks). `verifiedPaidTotal` sums owner-verified recorded payments; `unverifiedPaymentIds` lists payments still needing `verify_cleaner_payment`. Voided payments are excluded. Read-only.
- `post_cleaner_adjustment` appends date, signed amount, kind, reason and requestId. **Amount is a balance delta:** positive increases owed; negative decreases owed. `charge_correction` changes charges; `payment_correction` changes paid total (negative adds paid, positive reverses paid). Original history and payments remain intact. Retry only with identical details and requestId; reverse a mistaken correction with a separate opposite adjustment and reason.
- `correct_cleaning_date` records the actual cleanedOn date for a completed job, with an immutable reason/receipt. It preserves checkout and original completion confirmation. Do not infer dates from checkout; verify the cleaner's workday first.
- `record_cleaner_payment` stores the bank confirmation in `reference`. Normalized duplicate references are rejected; similar references for equal amounts within two days require review. Set `verified: true` only after the owner checks bank records, or use `verify_cleaner_payment` for an existing payment. Never add a second payment to work around a refusal.
- `import_reservation_csv` accepts a per-listing CSV, exact column mappings, statusMap and an idempotency requestId. It requires ISO YYYY-MM-DD dates; normalize exports explicitly rather than guessing ambiguous dates. `import_reservation_history` accepts normalized stays directly. Both create reference stays only, never cleanings, charges or payments. Use original channel reservation IDs for stable sourceReference values. Corrections with a fresh requestId update that reference stay; exact retries are harmless.
- **Booking.com history:** export reservations from the extranet, save as CSV with ISO dates, and call `import_reservation_csv` with `channel: "booking"`. Map the reservation-number column to `sourceReference` so re-importing the same file (with any requestId) updates rows instead of duplicating them. Booking.com does not publish its export's header names, so there is no built-in preset: read the header row and pass the exact names in `columns`, and map every raw status (for example `ok`, `cancelled_by_guest`, `no_show`) in `statusMap`. Past `ok` stays are `completed`.
- `get_reservation_history` accepts physical propertyId, cleaningDate and optional booked listingId. It returns matched, ambiguous or not_found with candidates. It checks the latest checkout within the cleaning day or prior two days, excludes cancelled/no-show reservations, and merges exact duplicate CSV/iCal references. A single anonymous iCal mirror with identical listing/check-in/checkout and a compatible channel is represented by the named import even when its feed UID differs; conflicting or competing stays remain ambiguous. A missing match is an evidence gap, never permission to invent a stay.

Imported statement IDs passed to `get_cleaning_scope` or `get_job_pay` return a structured 422 response with `details.lockReason: "imported_history"` and `correctionPath: "post_cleaner_adjustment"`. Unexpected server failures remain 500. REST, MCP and OpenAPI use the same tool registry.

## Bookability and channel calendars

TurnFlow scans every Hostex channel calendar (each Airbnb listing and each Booking.com rate plan) once a day at 12:00 UTC, and on demand. Hostex remains the channel manager; TurnFlow reads, judges, and only writes owner-approved changes. Server env: `HOSTEX_API_TOKEN` (Hostex Open API v3, spec at https://hostex.io/open_api/v3/config.json) and, optionally, `PRICELABS_API_KEY` (PriceLabs Customer API, read-only use of `GET /v1/listings`).

**Read tools**
- `get_bookability_report`: open findings (severity-ordered, date ranges, probable cause, next step), every channel calendar with its `pricingAuthority`, `price_readonly`, Hostex ratio and plan name, and the scanner heartbeat (`stale: true` after 26 hours without a successful scan).
- `run_bookability_scan`: re-reads Hostex now and refreshes findings. Never changes rates. A finding resolves only when a successful scan no longer produces it.
- `preview_calendar_change`: dry run; returns all validation errors, large-change warnings and the current values that would be replaced.
- `verify_calendar_change`: reads a submitted change back from the live calendar.
- `list_calendar_changes`: recent changes with requested values, prior values (`before`) and status.

**Write tools** (write token plus `approved: true` after the owner's explicit approval)
- `update_channel_listing`: TurnFlow settings only: `pricingAuthority` (`pricelabs` | `turnflow` | `manual`), `intentionallyClosed`, `expectedRatio`. Changing the authority restarts the 72-hour pricing-staleness clock.
- `apply_calendar_change`: sends one price or restriction change to Hostex.

**Finding rules**
| Rule | Severity | Meaning |
|---|---|---|
| `missing_price` | critical | Open, sellable night with no price (or Hostex returned no calendar) |
| `pricing_stale` | critical / warning | PriceLabs-owned calendars with `PRICELABS_API_KEY`: **critical** when a property hasn't been pushed for 36 hours, has sync off, or isn't in PriceLabs (warning if the API can't be read). Without the key: **warning** after 72 hours with no price change, because PriceLabs can push unchanged prices; confirm with the PriceLabs MCP connector (`get_listing_data` → `last_date_pushed`). TurnFlow-owned calendars: **critical** after 72 hours with no price change. Changing the authority starts a fresh grace period |
| `scan_stale` | critical | The scan failed, or (on read) no successful scan in 26 hours |
| `closed_while_available` | warning | Property open but this calendar has zero inventory, unless marked intentionally closed |
| `ratio_drift` | warning | Price moved more than 2% from the plan's ratio to Airbnb (configured or observed) |
| `restriction_conflict` | warning | Closed to arrival/departure on an open night, or min stay above max stay |
| `far_out_min_stay` | info | Minimum stay of 7+ nights |

Booked and owner-blocked nights are never judged.

**Fixing a problem safely**
1. `get_bookability_report` (call `run_bookability_scan` first if it is stale).
2. Check the listing's `price_readonly`. **Readonly rate plans (for example Booking.com non-refundable, weekly or monthly plans derived from the Standard Rate) are priced by the channel. Hostex accepts but cannot apply API price pushes to them.** A `missing_price` there is fixed in the channel extranet: set the plan's derivation from its parent rate, or deactivate the plan. Report this to the owner; do not call `apply_calendar_change`. Restriction changes on such plans are allowed.
3. A calendar whose authority is `pricelabs` refuses manual prices, because PriceLabs would overwrite them. Ask the owner whether to switch it to `manual` with `update_channel_listing`. Never let two systems price one calendar.
4. `preview_calendar_change` with `channelType`, `listingId`, `kind` (`price` or `restrictions`) and up to 50 non-overlapping `ranges` (`startDate`, `endDate` inclusive, YYYY-MM-DD). Prices are whole amounts in the listing currency (Hostex accepts integers only). Restriction fields: `minStayOnArrival`, `maxStayOnArrival`, `minStayThrough`, `maxStayThrough`, `closedOnArrival`, `closedOnDeparture`. Price and restriction changes are separate requests.
5. Show the owner the preview, including every warning. Price changes affect what guests pay immediately.
6. After explicit approval: `apply_calendar_change` with a new UUID `requestId` and identical details. Retrying with the same `requestId` and details returns the stored result and never sends twice; a reused `requestId` with different details is refused.
7. Hostex applies changes asynchronously: `submitted` does not mean live. Call `verify_calendar_change` after a minute or two. `verified` means the channel calendar shows the requested values; `submitted` means not visible yet; `mismatch` means still different 15 minutes after submission. On a mismatch, check the task result in the Hostex price portal and tell the owner. Never resend blindly.
8. `run_bookability_scan` to confirm the finding resolved.

To reverse a change, read its `before` values from `list_calendar_changes`, then preview and apply them as a new change with a new `requestId`, after approval. Check `get_schedule` first: nights booked since the change are unaffected by a price reversal, but restriction reversals can change what is sellable.

Not available through agents: Airbnb availability-window settings (how far ahead guests can book), inventory changes, and rate-plan derivation rules. These are changed in Hostex or the channel extranet by the owner.


### Calendar verification and retries

Calendar writes recheck the current workspace mapping, Hostex connection, and read-only status. Missing current data, invalid civil dates, or conflicting resulting stay restrictions block the write. A timeout after submission means the outcome is uncertain: retain the same requestId and call `verify_calendar_change`; never assume nothing was applied or resend under a new requestId. Verification confirms Hostex's channel-calendar readback, not an independent check of the OTA website.

A scan needs every requested calendar and availability date before resolving existing findings. A partial response or failed health read stays visible as unverified/stale. Disconnected channels are retained as audit history but are excluded from new scans and cannot receive new writes.
