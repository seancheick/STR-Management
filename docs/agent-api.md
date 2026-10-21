# Agent connections

Production MCP endpoint: https://str-management-sean-cheicks-projects.vercel.app/api/mcp

REST schema: https://str-management-sean-cheicks-projects.vercel.app/api/agent/v1/openapi.json

Create a token under Settings → AI agents. Send `Authorization: Bearer <token>`.
Read tokens expose eight read tools; write tokens expose all 17 tools. Revoke a token in Settings to block subsequent requests.

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
