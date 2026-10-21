# Agent connections

Production MCP endpoint: https://str-management-sean-cheicks-projects.vercel.app/api/mcp

REST schema: https://str-management-sean-cheicks-projects.vercel.app/api/agent/v1/openapi.json

Create a token under Settings → AI agents. Send `Authorization: Bearer <token>`.
Read tokens expose ten read tools; write tokens expose all 22 tools. Revoke a token in Settings to block subsequent requests.

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
- `post_cleaner_adjustment` appends date, signed amount, kind, reason and requestId. **Amount is a balance delta:** positive increases owed; negative decreases owed. `charge_correction` changes charges; `payment_correction` changes paid total (negative adds paid, positive reverses paid). Original history and payments remain intact. Retry only with identical details and requestId; reverse a mistaken correction with a separate opposite adjustment and reason.
- `correct_cleaning_date` records the actual cleanedOn date for a completed job, with an immutable reason/receipt. It preserves checkout and original completion confirmation. Do not infer dates from checkout; verify the cleaner's workday first.
- `record_cleaner_payment` stores the bank confirmation in `reference`. Normalized duplicate references are rejected; similar references for equal amounts within two days require review. Set `verified: true` only after the owner checks bank records, or use `verify_cleaner_payment` for an existing payment. Never add a second payment to work around a refusal.
- `import_reservation_csv` accepts a per-listing CSV, exact column mappings, statusMap and an idempotency requestId. It requires ISO YYYY-MM-DD dates; normalize exports explicitly rather than guessing ambiguous dates. `import_reservation_history` accepts normalized stays directly. Both create reference stays only, never cleanings, charges or payments. Use original channel reservation IDs for stable sourceReference values. Corrections with a fresh requestId update that reference stay; exact retries are harmless.
- `get_reservation_history` accepts physical propertyId, cleaningDate and optional booked listingId. It returns matched, ambiguous or not_found with candidates. It checks the latest checkout within the cleaning day or prior two days, excludes cancelled/no-show reservations, and merges exact duplicate CSV/iCal references. A missing match is an evidence gap, never permission to invent a stay.

Imported statement IDs passed to `get_cleaning_scope` or `get_job_pay` return a structured 422 response with `details.lockReason: "imported_history"` and `correctionPath: "post_cleaner_adjustment"`. Unexpected server failures remain 500. REST, MCP and OpenAPI use the same tool registry.
