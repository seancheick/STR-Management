# PriceLabs MCP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Owner-scoped direct read-only MCP connection, real sync health, and separately correct PriceLabs bedroom metadata.

**Architecture:** Cookie-owner-only routes start PKCE consent, exchange callback and disconnect. Service-only encrypted database records store pending state and token grants, using versioned lease fencing for refresh. Fixed-endpoint JSON-RPC client discovers read-tool schemas and validates complete listing results for bookability.

**Tech Stack:** Next.js routes/server components, Node crypto, Supabase Postgres, Vitest.

## Task 1: OAuth persistence and security
Files: src/lib/pricelabs/{crypto,oauth,store}.ts; generated supabase migration; tests/unit/pricelabs-oauth.test.ts; tests/db/pricelabs-mcp.test.sql.
- [ ] Write failing tests for authenticated encryption owner/purpose binding, tampering and invalid key.
- [ ] Add service-only tables for pending state and connection, RLS and grants denying anon/authenticated. Pending state hash, expiry and encrypted verifier with owner/purpose binding; remove expired pending flows; connection generation, token ciphertext, expiry, scope, refresh lease.
- [ ] Implement fixed callback origin from PRICELABS_REDIRECT_URI, strict read scope, random state/verifier, single-use atomic consumption bound to authenticated owner. Fixed provider endpoints only, redirect:error for token and authenticated MCP requests, bounded fetch, redacted errors. Test redirects never forward credentials.
- [ ] Implement encrypted tokens with random GCM nonce and owner/purpose AAD; strict key validation.
- [ ] Refresh by atomic lease acquisition, update/delete by generation and lease identity; reconnect replaces generation, disconnect deletes grant and pending flows; timed-out refresh requires reauthorization to avoid replaying possibly rotated refresh token.
- [ ] Test token failure, rotation, disconnect/reconnect fencing and RLS isolation.

## Task 2: Read-only MCP client and health
Files: src/lib/pricelabs/{mcp,client}.ts; src/lib/services/bookability-runner.ts; tests/unit/pricelabs-mcp.test.ts.
- [ ] Write failing JSON/SSE/error/malformed/pagination normalization tests.
- [ ] Implement initialized Streamable HTTP client at fixed MCP endpoint, JSON-RPC id validation, bounded sizes/timeouts, session/protocol headers; allowlist get_listings/get_listing_data only, discover tool schemas.
- [ ] Validate complete listing coverage and detailed per-listing push records. Reject unknown shapes and incomplete pages as unverified. Accept only actual booleans, valid timestamps, no future timestamps; preserve channel typed IDs.
- [ ] MCP per-owner before legacy API; legacy API permitted only for PRICELABS_API_OWNER_ID. Failed MCP must not fall back silently. Keep previous critical sync evidence with an explicit verification failure in health reconciliation.
- [ ] Add bookability rule/runner tests for owner-specific selection, legacy restriction, critical finding retention on verification failure and resolution after verified recovery. Run tests and typecheck.

## Task 3: Owner Settings connection UI
Files: src/app/api/integrations/pricelabs/{connect,callback,disconnect}/route.ts; src/lib/pricelabs/auth.ts; src/app/(admin)/dashboard/settings/page.tsx.
- [ ] Write owner-cookie/synthetic-agent/cross-origin/invalid callback state tests.
- [ ] Owner-only Settings card with readiness, connection status, Connect and Disconnect forms. No secrets sent to browser. Real cookie getUser plus active self-owned owner required. POST connect/disconnect Origin validated against fixed callback origin. Callback state single-use and cookie-owner-bound.
- [ ] Show safe status outcomes via Settings query parameter, never raw upstream errors/codes/tokens. Fixed redirect with no-store/referrer-policy.
- [ ] Build and browser smoke Settings and unauthenticated routes.

## Task 4: Production setup and bedroom correction
- [ ] Run full local unit/lint/typecheck/build/database suites and review diff before any production mutation. Then verify generated migration, apply production migration and set encryption/client configuration securely.
- [ ] Create separate TurnFlow custom client with production callback only after action-time confirmation. Owner enters any new credentials themselves per UI policy. Owner consents read scope.
- [ ] Live MCP list/detail read verifies all five mappings and actual push timestamps. Health scan uses direct connection.
- [ ] Bedroom counts: stable PriceLabs IDs 22963_12815776_house=2,22964_12815777_house=3,22965_12815779_house=3,23092_12815775_house=1,23095_12815778_house=2. Account editor currently locked; request support unlock only if user authorizes message. Read back after supported edits; never use private endpoints.
- [ ] Full unit/lint/typecheck/build sequentially, database tests, final diff review, commit and push main. Verify production deployment and read-only flow. Report any external blocker explicitly.
