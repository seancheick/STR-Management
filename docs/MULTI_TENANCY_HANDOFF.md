# Multi-Tenancy Handoff · Path B Implementation Plan

> **Status**: Planning · not yet implemented
> **Owner**: Sean (seancheick@gmail.com)
> **Target**: Real multi-tenant SaaS where each host has isolated data
> **Estimated effort**: 1 focused day (8-10 hours) for MVP + half a day for polish
> **Last updated**: 2026-04-21

---

## Table of contents

1. [Why this document exists](#why-this-document-exists)
2. [Current state — what's actually in the code](#current-state)
3. [Target state — what multi-tenant looks like](#target-state)
4. [Phase 1 · Schema changes](#phase-1--schema-changes)
5. [Phase 2 · RLS rewrite](#phase-2--rls-rewrite)
6. [Phase 3 · Application code changes](#phase-3--application-code-changes)
7. [Phase 4 · Signup + invite flow](#phase-4--signup--invite-flow)
8. [Phase 5 · Data backfill](#phase-5--data-backfill)
9. [Phase 6 · Security audit + testing](#phase-6--security-audit--testing)
10. [Phase 7 · Rollback plan](#phase-7--rollback-plan)
11. [Beyond MVP — where this goes next](#beyond-mvp)
12. [Open questions](#open-questions)
13. [Appendix A · Table inventory](#appendix-a--table-inventory)
14. [Appendix B · RLS cheat sheet](#appendix-b--rls-cheat-sheet)

---

## Why this document exists

The app was originally scoped for a single operator (Sean). Cleaners, admins, and supervisors all share one data pool. If a second operator signed up today they would immediately see Sean's properties, bookings, cleaners, and payouts. That is not a bug — it is the logical consequence of role-based RLS with no tenant dimension.

This document is the full plan to turn TurnFlow into a real multi-tenant SaaS where each operator runs their own isolated world, can invite their own admins and cleaners, and cannot see or touch any other operator's data.

Two things to keep in mind while reading:

1. **Schema is already 80% ready.** Most tables carry an `owner_id`. That column is already populated correctly. We are not refactoring the data model, just tightening what it means.
2. **Cleaners are the hardest case.** An operator has a cleaning crew. If that cleaner one day works for *two* different operators (totally plausible — cleaners move between hosts), do we allow one user row with two tenant memberships, or force two separate cleaner accounts? Decision captured in [Open questions](#open-questions).

---

## Current state

### How roles work today

```
user_role enum: owner · admin · supervisor · cleaner
```

- Anyone with role `owner`, `admin`, or `supervisor` passes `is_admin_role()` and has full RLS access to every row on every tenant-scoped table.
- Cleaners are restricted via `can_access_assignment()` / `can_access_property()` to rows where `assignments.cleaner_id = auth.uid()`.

### What's already multi-tenant

Tables with `owner_id`:

```
assignments, audit_logs, calendar_sync_logs, checklist_templates, issues,
notifications, payout_batches, payout_entries, properties,
property_calendar_sources, property_inventory_items, recurring_tasks,
reservations, restock_requests
```

(Plus the three views `v_exception_counts`, `v_low_inventory`, `v_pending_recleans`.)

Application code already calls `resolveOwnerId()` on every insert and stamps the current admin's identity. Good groundwork.

### What's NOT multi-tenant

1. **`users` has no `owner_id`.** An admin/supervisor/cleaner is not linked to a specific tenant. Role alone governs access.
2. **RLS is role-only.** `is_admin_role()` returns true for *any* user with role in (owner, admin, supervisor). That's the leak.
3. **No signup path creates a tenant.** Today you seed a user manually in Supabase. For a real app we need a "sign up as host" flow that creates a tenant on the spot.
4. **Join tables that don't carry `owner_id`** (`assignment_checklist_items`, `assignment_events`, `assignment_notes`, `assignment_photos`, `issue_media`, `job_messages`, `device_subscriptions`, etc.) inherit tenancy transitively via their parent FK. Those need RLS that joins up to the parent and checks the parent's `owner_id`.

---

## Target state

```
┌─────────────┐
│   owner     │  ← user with role='owner', users.owner_id = self.id
│   (tenant)  │     Signs up, invites team, pays the bill
└──────┬──────┘
       │
       │ users.owner_id = this owner's id
       │
       ▼
 ┌──────────┬──────────┬──────────┐
 │  admin   │supervisor│  cleaner │
 └──────────┴──────────┴──────────┘
       │
       │ all rows stamped with owner_id = this owner
       │
       ▼
  properties, assignments, reservations, notifications, ...
```

**Guarantees after refactor**

- No query, action, or API route returns any row belonging to a different tenant.
- Sign-up page creates a brand-new isolated tenant in one click.
- Existing `/dashboard/team` page invites users into *this* tenant, with the correct `owner_id`.
- Service-role code (crons, iCal sync) continues to work across all tenants — the isolation is RLS-based, and service role bypasses RLS.

---

## Phase 1 — Schema changes

Single migration file. Apply to local dev first, then Supabase production.

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_multi_tenancy.sql

-- 1. Tenant link on users.
--    For role='owner' users, owner_id equals their own id (they own themselves).
--    For role='admin'|'supervisor'|'cleaner', owner_id points to the owner
--    user they belong to.
alter table public.users
  add column if not exists owner_id uuid references public.users (id) on delete cascade;

create index if not exists idx_users_owner_id on public.users (owner_id);

comment on column public.users.owner_id is
  'The tenant this user belongs to. For role=owner, equals id. For all other roles, the owner user id that hired them.';

-- 2. Helper function that resolves the caller's tenant id.
create or replace function public.current_owner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select owner_id from public.users where id = auth.uid();
$$;

-- 3. Rename the old `is_admin_role()` to something narrower — it still has
--    a purpose (checking admin-level privileges WITHIN a tenant) but should
--    never be the only gate on cross-tenant data.
--    Keep it, but its callers must also filter by owner.

-- 4. Tenant-aware helper: callable from RLS policies. True when the current
--    user is an admin/owner AND the row belongs to their tenant.
create or replace function public.is_tenant_admin(row_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select row_owner_id = public.current_owner_id()
     and public.current_app_user_role() in ('owner', 'admin', 'supervisor');
$$;

-- 5. Tighten foreign keys that should cascade when a tenant deletes.
--    Owners deleting their account → cascade properties, reservations, etc.
--    We already have on delete cascade on most. Audit this list.

-- 6. NOT NULL owner_id everywhere (after backfill). Run this AT THE END
--    of the migration process, after Phase 5 backfill has populated every row.
```

**Why `owner_id` on users and not a separate `tenants` table?**
Because an owner IS a tenant. Adding a `tenants` row only makes sense if one tenant can have multiple owners (co-owners, enterprise accounts). We can add that later — for now, `owner_id` on users gives us a single-column membership check that joins cleanly to every other tenant-scoped table.

---

## Phase 2 — RLS rewrite

Currently every tenant-scoped table has a policy that reads:

```sql
using (public.is_admin_role())
```

We rewrite each one to:

```sql
using (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
)
```

**Full list of policies to rewrite** (see [Appendix B](#appendix-b--rls-cheat-sheet) for the exact SQL per table):

| Table | Policies to rewrite |
|-------|----------------------|
| properties | `admins can manage properties` |
| assignments | `admins can insert assignments` (the read/update policies already use `can_access_assignment` which joins via cleaner_id — extend to also check owner_id) |
| reservations | `admins manage reservations` + `admins read reservations` |
| notifications | all policies |
| calendar_sync_logs | all policies |
| payout_batches, payout_entries | all policies |
| property_calendar_sources | all policies |
| property_inventory_items | all policies |
| checklist_templates | all policies |
| recurring_tasks | all policies |
| issues | all policies |
| restock_requests | all policies |
| audit_logs | read-only admin policy |

**Transitive-ownership policies** (tables without `owner_id` that inherit via FK):

```sql
-- Example: assignment_checklist_items inherits from assignments
create policy "tenant isolates via assignment"
on public.assignment_checklist_items
for all
to authenticated
using (
  exists (
    select 1 from public.assignments a
    where a.id = assignment_id
      and a.owner_id = public.current_owner_id()
  )
)
with check (
  exists (
    select 1 from public.assignments a
    where a.id = assignment_id
      and a.owner_id = public.current_owner_id()
  )
);
```

Same shape for: `assignment_events`, `assignment_notes`, `assignment_photos`, `issue_media`, `job_messages`.

**`device_subscriptions`** is special — it's scoped by `user_id`, not `owner_id`. It already can't leak because the RLS filter is `user_id = auth.uid()`. No change needed, but verify the policy exists.

**Users table itself** — new policy so admins can only see users within their own tenant:

```sql
drop policy if exists "users can read self or admins can read all" on public.users;
create policy "tenant scoped user read"
on public.users
for select
to authenticated
using (
  id = auth.uid()
  or (
    owner_id = public.current_owner_id()
    and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
  )
);
```

---

## Phase 3 — Application code changes

Even after RLS is right, we should audit the app code to make sure we aren't serving data cross-tenant by accident before it reaches the database.

### 3.1 `resolveOwnerId()` audit

Current behavior: returns the first user with `role='owner'`. Single-tenant shortcut.

New behavior:

```typescript
// src/lib/queries/properties.ts (or wherever it lives)
export async function resolveOwnerId(): Promise<string> {
  const profile = await requireAuth();
  if (!profile.owner_id) {
    throw new Error("User has no tenant — multi-tenancy not configured");
  }
  return profile.owner_id;
}
```

Search for every call site. Most are in server actions — they should automatically do the right thing once this helper changes.

### 3.2 Session loader carries `owner_id`

`src/lib/auth/session.ts::getCurrentUserProfile()` needs to select `owner_id` alongside `id`, `email`, `full_name`, `role`. Every page/action that reads `profile.id` might want `profile.owner_id` too.

### 3.3 Service-role paths — be careful

Service-role (`createServiceSupabaseClient`) bypasses RLS. Used by:

- `/api/cron/sync-calendars`
- `/api/cron/send-reminders`
- `/api/cron/recurring-tasks`
- `/api/cron/weekly-digest`
- `src/lib/ical/sync-service.ts`
- `src/lib/notifications/push.ts`
- `src/app/(admin)/dashboard/team/actions.ts` (invite flow)

These MUST always filter by `owner_id` explicitly in their queries. Today they do this already because they iterate per-owner. After the refactor, double-check every one still scopes correctly — a missed filter in cron code would send one tenant's schedule as a push to another tenant.

### 3.4 Public endpoints

`/api/ical/owner/[token]/route.ts` uses the owner's user id as the token. This already works post-refactor — the token IS the tenant id. Verify the query only returns that owner's assignments (it does).

`/api/schedule/export.csv` uses the cookie-authed client, which respects RLS. ✓

### 3.5 First-run wizard

`src/components/dashboard/first-run-wizard.tsx` checks `hasProperty`, `hasCalendarSource`, `hasCleaner`. These queries go through RLS, so they'll naturally scope to the new tenant. ✓

---

## Phase 4 — Signup + invite flow

### 4.1 Host self-signup

New marketing page path: `/sign-up` (or the existing `/` landing page's email form becomes a real signup).

Server action creates:

1. A Supabase `auth.users` row (email + password)
2. A public `users` row with `role='owner'`, `active=true`, `owner_id = that same user's id`
3. Redirects to `/dashboard` — they land on the first-run wizard, empty state

```typescript
export async function signUpAsHostAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;

  const supabase = createServerSupabaseClient();
  const { data: authUser, error: authError } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (authError || !authUser.user) {
    return { error: authError?.message ?? "Signup failed" };
  }

  // Using service client to insert the profile row because the just-created
  // auth user doesn't have a session yet on this request.
  const service = createServiceSupabaseClient();
  await service.from("users").insert({
    id: authUser.user.id,
    email,
    full_name: fullName,
    role: "owner",
    active: true,
    owner_id: authUser.user.id, // self-reference
  });

  // Email verification → redirect to sign-in; app will take care of the rest.
  redirect("/sign-in?verify=1");
}
```

### 4.2 Invite existing team members

Today `/dashboard/team` has an "Invite cleaner" flow. Extend:

- Generate an invitation token (new table `invitations` or use Supabase's built-in `admin.inviteUserByEmail`)
- Store `owner_id = current tenant` on the invitation
- When invitee clicks the email link, their `users` row is created with the captured `owner_id` and the requested role

Minimum viable: use Supabase's `inviteUserByEmail` with user metadata carrying `owner_id` and `role`, then a server-side trigger or client-side sign-in callback copies metadata into the `users` row.

### 4.3 Preserving cleaners' experience

Many cleaners work for multiple hosts in real life. Two options:

- **MVP**: one `users` row per (cleaner, tenant) pair. Cleaner signs in with a different email per tenant. Simple but clunky.
- **V2**: `user_tenant_memberships(user_id, owner_id, role)` join table. One cleaner account, tenant-switcher in the UI.

Ship MVP first, revisit once we have ≥3 paying tenants.

---

## Phase 5 — Data backfill

After Phase 1 migration (`owner_id` column exists but nullable), run a backfill before Phase 2 RLS tightening.

```sql
-- Every existing user becomes part of the original single tenant.
-- Replace <current-owner-uuid> with the actual id of the first owner user.
with current_owner as (select id from public.users where role = 'owner' limit 1)
update public.users
set owner_id = (select id from current_owner)
where owner_id is null;

-- Owners are self-tenants
update public.users
set owner_id = id
where role = 'owner' and owner_id is null;

-- Verify: everyone has a tenant now
select role, count(*) filter (where owner_id is null) as missing
from public.users
group by role;
-- Expected: all zeros
```

Then make the column `NOT NULL`:

```sql
alter table public.users alter column owner_id set not null;
```

Existing `owner_id` values on tenant tables (properties, assignments, etc.) are already correct — nothing to backfill there.

---

## Phase 6 — Security audit + testing

### 6.1 Impersonation test suite

```sql
-- Create two test tenants
-- (run locally, not in production)
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values ('11111111-...', 'tenant-a@test.com', crypt('pw', gen_salt('bf')), now()),
       ('22222222-...', 'tenant-b@test.com', crypt('pw', gen_salt('bf')), now());

insert into public.users (id, email, full_name, role, active, owner_id)
values ('11111111-...', 'tenant-a@test.com', 'Tenant A', 'owner', true, '11111111-...'),
       ('22222222-...', 'tenant-b@test.com', 'Tenant B', 'owner', true, '22222222-...');

-- Now impersonate each and try to read the other's data.
-- Expected: zero rows for every cross-tenant query.
```

### 6.2 Manual checklist — per page, log in as Tenant B and confirm no Tenant A data appears

- [ ] `/dashboard` (KPIs, today's jobs, properties tile)
- [ ] `/dashboard/schedule` (all three views: timeline / week / month)
- [ ] `/dashboard/assignments` (list, filters, bulk actions)
- [ ] `/dashboard/properties` (list + detail)
- [ ] `/dashboard/team`
- [ ] `/dashboard/calendar` (iCal sources)
- [ ] `/dashboard/payouts` (quick-pay + batch reports)
- [ ] `/dashboard/issues`
- [ ] `/dashboard/review`
- [ ] `/dashboard/analytics`
- [ ] `/dashboard/notifications`
- [ ] `/dashboard/health` ← admin-only; should ONLY show your tenant
- [ ] `/dashboard/templates`
- [ ] `/api/schedule/export.csv` — GET with crafted query params
- [ ] `/api/ical/owner/[token]` — try your token vs another tenant's
- [ ] Cron endpoints — should still process all tenants when called with `CRON_SECRET`

### 6.3 Automated test

Add a vitest that spins up two anon Supabase clients with two different `auth.uid()`s and asserts zero cross-reads. See `tests/unit/tenant-isolation.test.ts` (to be created).

---

## Phase 7 — Rollback plan

If multi-tenancy breaks production for the current single operator:

1. Redeploy the last pre-refactor commit (keeps the old role-based RLS).
2. Run the inverse migration:
   ```sql
   alter table public.users drop column if exists owner_id;
   drop function if exists public.current_owner_id();
   drop function if exists public.is_tenant_admin(uuid);
   ```
3. Restore the role-based policies (stored in `supabase/migrations/20260415150000_sprint_1_foundation.sql` — git log them).

Rollback should take < 15 minutes. Keep a DB snapshot taken immediately before the multi-tenant migration runs.

---

## Beyond MVP

Things to tackle once basic multi-tenancy ships and a few tenants are live.

### 1. Billing / plans

Stripe Customer per tenant. Plans: Free (1 property, 1 cleaner), Starter ($19/mo, up to 5 properties), Pro ($49/mo, unlimited). Attach `stripe_customer_id` on the owner's user row. Gate property creation on subscription tier.

### 2. Co-owners / enterprise accounts

Add a `tenants` table so multiple users can own the same tenant. Migrate `owner_id` to `tenant_id`. Touch every policy. Ship when first enterprise deal requires it.

### 3. Cross-tenant cleaner accounts

Cleaners should be able to work for multiple hosts with one login. Two designs:

- **Path α**: `user_tenant_memberships(user_id, owner_id, role, invited_at, accepted_at)`. Nav bar gets a tenant-switcher.
- **Path β**: Keep one-user-per-tenant. Build a "link my account to another host" flow that merges notifications/inboxes client-side.

Path α is the industry norm. More work but cleaner.

### 4. Custom subdomains

`acme-cleans.turnflow.app` per tenant. Requires middleware that reads the host header, looks up the tenant, and stuffs tenant id into the request. Adds a tenant-specific login page and branded PWA. Nice-to-have, not blocking.

### 5. Audit log UI

`audit_logs` table exists and is populated but has no admin viewer. Per-tenant audit log: "You changed Sofia's payout on Apr 20 at 9:14 AM from $80 → $95." Builds trust and helps debugging.

### 6. Data export + delete (GDPR / CCPA)

Every tenant needs "download all my data as JSON" and "delete my account" self-serve. Ship this BEFORE charging money — it's a compliance requirement in the EU and California.

### 7. SSO + magic-link login

For larger operators who want to onboard teams quickly. Supabase Auth supports both.

### 8. Rate limiting per tenant

Prevents one tenant from exhausting your Supabase quota. Apply at Vercel's edge or via a middleware that increments a Redis counter per `owner_id`.

### 9. Per-tenant customization

Logo upload, brand color, custom email footer. Stored on the `users` (owner) row. Cheap to implement, meaningful for branding.

### 10. Multi-tenant observability

Every log line, error, and metric tagged with `owner_id` so "which tenant is slow?" becomes answerable. Sentry + Logtail both support custom tags.

### 11. Impersonation for support

Admin tool (`/admin/impersonate?owner_id=...`) gated to Sean-only (your email). Without this, debugging a paying tenant's issue is painful. Implement with a secure session flag; log every impersonation session in audit_logs.

### 12. Soft-delete everything

Right now `active=false` on users/properties is a soft-delete. Extend that pattern to assignments (we already have `status='cancelled'`) and reservations. Never hard-delete tenant data — restore is cheap, recovery from accidental delete is priceless.

---

## Open questions

Answered by Sean before kicking off Phase 1.

| # | Question | Options | My leaning |
|---|-----------|---------|------------|
| 1 | Can one cleaner work for two tenants? | One-row-per-tenant · Memberships table | Start with one-row-per-tenant; migrate later |
| 2 | Custom subdomains from day one? | Yes · Single domain + routing | Single domain; subdomains after paying tenants |
| 3 | Stripe billing gating properties / cleaners? | Yes, day one · Later | Later — friction kills early adoption |
| 4 | What's the free tier ceiling? | Unlimited · 1 property · 3 properties | 1 property + 1 cleaner = real product try-before-you-buy |
| 5 | Do we let cleaners sign up on their own? | Yes · Only invited | Only invited, at least for v1 |
| 6 | Should hosts be able to transfer ownership (sell their STR business)? | Yes, via support · Never | Via support; uncommon enough not to self-serve |
| 7 | Data residency (EU tenants)? | N/A day one · Multiple Supabase regions | N/A — ship to the US first, worry about EU once revenue exists |

---

## Appendix A — Table inventory

Every tenant-scoped table, its `owner_id` status, and its current RLS posture as of 2026-04-21.

| Table | `owner_id` | Current RLS | Needs rewrite |
|-------|-----------|-------------|----------------|
| properties | ✓ | role-based | yes |
| assignments | ✓ | `can_access_assignment` (joins cleaner_id) | extend to check owner_id |
| reservations | ✓ | role-based | yes |
| notifications | ✓ | role-based | yes |
| calendar_sync_logs | ✓ | role-based | yes |
| payout_batches | ✓ | role-based | yes |
| payout_entries | ✓ | role-based | yes |
| property_calendar_sources | ✓ | role-based | yes |
| property_inventory_items | ✓ | role-based | yes |
| checklist_templates | ✓ | role-based | yes |
| recurring_tasks | ✓ | role-based | yes |
| issues | ✓ | role-based | yes |
| restock_requests | ✓ | role-based | yes |
| audit_logs | ✓ | admin read-only | yes |
| users | ✗ (add now) | self or admin | yes, rewrite using new owner_id |
| assignment_checklist_items | via FK | inherits | new transitive policy |
| assignment_events | via FK | inherits | new transitive policy |
| assignment_notes | via FK | inherits | new transitive policy |
| assignment_photos | via FK | inherits | new transitive policy |
| checklist_template_items | via FK | inherits | new transitive policy |
| issue_media | via FK | inherits | new transitive policy |
| job_messages | via FK | inherits | new transitive policy |
| device_subscriptions | via `user_id` | self-only | verify, no change |
| early_access_requests | n/a | public write | verify write-only, no change |

---

## Appendix B — RLS cheat sheet

Template for the "write me a tenant-isolated policy on table X" task.

### Direct `owner_id` column

```sql
drop policy if exists "<old-policy-name>" on public.<table>;

create policy "<table> tenant isolation"
on public.<table>
for all
to authenticated
using (
  owner_id = public.current_owner_id()
)
with check (
  owner_id = public.current_owner_id()
);
```

Tighten to admin-only where writes should be owner/admin/supervisor-only:

```sql
create policy "<table> tenant isolation (admin write)"
on public.<table>
for all
to authenticated
using (
  owner_id = public.current_owner_id()
)
with check (
  owner_id = public.current_owner_id()
  and public.current_app_user_role() in ('owner', 'admin', 'supervisor')
);
```

### Transitive via FK (no `owner_id` on this table)

```sql
create policy "<table> inherits tenant from <parent>"
on public.<table>
for all
to authenticated
using (
  exists (
    select 1 from public.<parent> p
    where p.id = <fk>_id
      and p.owner_id = public.current_owner_id()
  )
)
with check (
  exists (
    select 1 from public.<parent> p
    where p.id = <fk>_id
      and p.owner_id = public.current_owner_id()
  )
);
```

### Cleaner-scoped read (via assignment)

Keep the existing `can_access_assignment()` function but update its body:

```sql
create or replace function public.can_access_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assignments
    where id = target_assignment_id
      and (
        (owner_id = public.current_owner_id()
          and public.current_app_user_role() in ('owner', 'admin', 'supervisor'))
        or cleaner_id = auth.uid()
      )
  )
$$;
```

---

## Kicking this off

When Sean is ready:

1. Take a fresh DB snapshot.
2. Branch off `main`: `git checkout -b multi-tenant-refactor`.
3. Walk through phases 1-7 in order — DO NOT skip ahead.
4. Merge to main only after Phase 6 manual checklist is 100% green.
5. Update this document's status at the top to `Implemented · 202X-XX-XX`.

Questions → seancheick@gmail.com.
