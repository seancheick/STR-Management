# Password recovery

Recovery emails use `supabase/email-templates/recovery.html` in the linked
Supabase project's recovery email template. The template points at the canonical
Site URL (`https://str-management-blond.vercel.app`) and passes a recovery token
hash to `/auth/callback`. That route verifies the token with Supabase, sets the
session cookies, and redirects to `/reset-password`.

This lets an email requested in the in-app browser open in Safari or Chrome,
without depending on a PKCE verifier stored in the original browser. Using the
public Site URL also avoids sending phone users to an unreachable localhost URL.
The existing redirect allowlist can remain limited to the hosted app.

Roll out callback support before updating the email template. Existing PKCE
links remain supported in their original browser; failed or expired recovery
links stay on the reset page and offer a fresh request instead of going to sign-in.
After this change, request a new email: previously sent emails are unchanged.
Never log reset links, token hashes, or session credentials.

Verification: callback unit tests cover direct-token recovery, expired token,
old cross-browser code failure, provider error, normal sign-in callbacks, and
open-redirect prevention. Live checks can use a deliberately invalid token to
verify failure routing without signing in as a real account. The user completes
actual password entry and submission themselves.
