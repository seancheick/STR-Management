# Linked database security audit

Verified 2026-10-11 against project `gubjybzovsfegzbejmaw` using the Supabase CLI linked Management API. The connected MCP project was not used.

## Security advisors

| Finding | Before | After database migration |
| --- | ---: | ---: |
| Security-definer views | 3 errors | 0 |
| Mutable function search paths | 3 warnings | 0 |
| Anonymous execution of definer functions | 12 warnings | 0 |
| Authenticated execution of definer functions | 12 warnings | 0 |
| Leaked password protection disabled | 1 warning | 1 |
| Total | 31 | 1 |

Migration `20261011193028_harden_database_security.sql` was applied atomically with `supabase db query --linked --file ...`, then registered with `supabase migration repair 20261011193028 --linked --status applied`. Local and remote migration history match. Only this migration was applied; unrelated files were not pushed.

## Changes and authorization contract

- `v_exception_counts`, `v_low_inventory`, and `v_pending_recleans` now use `security_invoker=true`, enforcing the caller's underlying table RLS.
- `set_updated_at`, `touch_updated_at`, and `touch_cleaner_access_code_set_at` have fixed search paths with catalog first and temporary schema last.
- Direct function execution was revoked from PUBLIC, anonymous, and authenticated roles for trigger/event-trigger functions. Existing trigger bindings remain; trigger firing does not require direct caller EXECUTE rights.
- `increment_inventory_quantity` and `recalculate_payout_batch` are SECURITY INVOKER. Their existing tenant-admin table policies now control every mutation; other tenants and cleaners cannot update these tables. Anonymous RPC execution is revoked. Trusted service-role execution remains available.
- Six RLS helpers have privileged implementations in `app_private` and unchanged public signatures implemented as invoker wrappers. This avoids recursive RLS on users/assignments while preserving existing policy dependencies. Anonymous schema/function execution is revoked; authenticated/service-role callers retain necessary access. Live PostgREST configuration confirms exposed schemas are `public,graphql_public`, so `app_private` is not exposed. Keep it outside the Data API schemas.
- Assignment/property helper access for cleaners additionally requires an active cleaner profile. Helpers never authorize by user-editable metadata.

The invoker mutation RPCs retain their previous void signature: a target outside the caller's RLS scope produces no update rather than an explicit application error. Callers should not interpret RPC success alone as confirmation that an inaccessible target changed.

## Verification

`supabase/tests/database_security_regression.sql` passed against the linked project through `supabase db query --linked --file ...`. It executes owner, another tenant's owner, cleaner, and anonymous sessions and verifies:

- Owner helpers and inventory/payout mutations succeed.
- Other-tenant and cleaner mutation attempts leave fixture values unchanged.
- Low-inventory view allows the owner and hides the fixture from another tenant; other views execute under authenticated RLS.
- Anonymous mutation RPC/helper calls fail with insufficient privilege.
- API roles cannot directly execute any public trigger/event-trigger function.
- Existing property/inventory triggers still execute during fixture operations.

All fixture inserts and the temporary activation of the otherwise inactive second owner run in one transaction ending in ROLLBACK. No assignment or payout-entry ledger rows are changed. These are integration assertions, not a pgTAP-format suite. The test requires an existing owner with an active cleaner plus a second owner account.

## Remaining account setting

The remaining security advisor is leaked password protection. Official documentation states this requires Pro or higher. No plan upgrade or billing change was made by this database migration. Live Management API inspection confirmed organization `fyqkzxstamwzhctapwjc` is on the Free plan and Auth configuration has `password_hibp_enabled=false`. Enabling this feature requires a paid plan upgrade; billing was not changed. A SQL migration cannot enable the Auth setting.

## Official references checked

- [Supabase changelog](https://supabase.com/changelog): fetched and checked for relevant breaking changes.
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): view invoker semantics, table grants, and policy enforcement.
- [Database functions](https://supabase.com/docs/guides/database/functions): invoker preference, definer privileges, and fixed search paths.
- [Password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection): leaked-password protection and Pro-plan requirement.

## Performance advisors

Migration `20261011193441_optimize_database_policies.sql` was applied atomically and registered in linked migration history. Performance findings fell from **24 warnings to zero**: 14 repeated Auth evaluations and 10 overlapping permissive-policy findings. No missing-index or unused-index findings were reported, and no indexes were removed.

Policies cache request identity through `(select auth.uid())` and stable caller helpers. Overlapping admin/cleaner policies are consolidated by operation with the original OR union retained. Admin ALL policies become separate SELECT/INSERT/UPDATE/DELETE policies to avoid overlapping SELECT/INSERT checks. These operations are authorized to authenticated callers; anonymous users have no business access.

The security role regression passed again after consolidation. `database_policy_equivalence.sql` also compares the original union against the consolidated predicates for every active user across existing rows, without persistent writes. These equivalence assertions preserve the pre-consolidation snapshot and should be revised when intentionally changing access rules.

## Final check after the remaining database changes

Re-ran linked `--type all` advisors after the physical-unit composite foreign key, ledger assignment unique index/audit table, and Hostex migration were applied. Result: **zero database security errors/warnings, zero performance findings, and one Auth warning** for leaked-password protection. No useful indexes were removed. The independently verified Free-plan requirement remains the blocker for the Auth setting.

Final recheck after `20261011195000_booking_configuration_identity` (assignment/reservation listing identity composite foreign keys and supporting indexes): still **zero errors, zero performance findings, and one Auth leaked-password warning**.

## Cleaner listing configuration access

Migration `20261011195024_cleaner_listing_configuration_access.sql` fixes the browser-observed missing listing join for cleaners after booking/listing identity was separated. The private property helper now requires the caller's active tenant and administrative role, or an own assignment referencing exactly the requested operational root or original `listing_property_id`. It does not authorize other configurations merely because they share a physical root. Inventory SELECT uses the same property authorization and tenant condition; inventory writes remain admin-only. Assignment checklist access remains assignment-scoped and needs no change.

`cleaner_listing_property_access.sql` passed against live assignments for every active cleaner, including jobs where the original listing differs from the operational root. Both helper authorization and actual authenticated property SELECT succeed for own listing/root configurations; privileged enumeration verifies denial for every unrelated/cross-tenant property. This restores `getProperty` notes/configuration access for the booked listing. The original security mutation/role regression also passed. The consolidation equivalence snapshot excludes inventory because its SELECT scope was intentionally extended and is now covered by this dedicated regression.

Final advisors after this change remain zero errors, zero performance findings, and the one Free-plan leaked-password protection warning. The migration's final version follows `20261011195000`; an earlier CLI-generated version was replaced and removed from history to preserve dependency order on fresh replay.
