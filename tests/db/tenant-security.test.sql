-- Tenant and privilege security tests. Run via tests/db/run.sh.
-- Each case runs in its own transaction and rolls back. A failing case
-- raises 'FAIL: ...' and stops the run (ON_ERROR_STOP).
--
-- Tenant A: owner a1, admin a2, supervisor a3, cleaner a4.  Tenant B: owner b1.

-- ── Seed (as postgres: auth.uid() is null, like a service/migration context) ──
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test'),
  ('a0000000-0000-0000-0000-000000000002', 'admin-a@test'),
  ('a0000000-0000-0000-0000-000000000003', 'super-a@test'),
  ('a0000000-0000-0000-0000-000000000004', 'cleaner-a@test');

update public.users set role = 'owner', owner_id = id
 where id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');
update public.users set owner_id = 'a0000000-0000-0000-0000-000000000001', role = 'admin'
 where id = 'a0000000-0000-0000-0000-000000000002';
update public.users set owner_id = 'a0000000-0000-0000-0000-000000000001', role = 'supervisor'
 where id = 'a0000000-0000-0000-0000-000000000003';
update public.users set owner_id = 'a0000000-0000-0000-0000-000000000001', role = 'cleaner'
 where id = 'a0000000-0000-0000-0000-000000000004';

insert into public.properties (owner_id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'A house'),
  ('b0000000-0000-0000-0000-000000000001', 'B house');

-- Acts as an authenticated user for the rest of the current transaction.
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Runs a statement, swallowing any error (a raise from a guard counts as blocked).
create function pg_temp.try(stmt text) returns void language plpgsql as $$
begin
  execute stmt;
exception when others then null;
end $$;

-- ── 1. Cleaner cannot promote themselves to owner ──
begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
set local role authenticated;
select pg_temp.try($$update public.users set role = 'owner' where id = auth.uid()$$);
reset role;
do $$ begin
  if (select role from public.users where id = 'a0000000-0000-0000-0000-000000000004') <> 'cleaner' then
    raise exception 'FAIL 1: cleaner changed own role';
  end if;
end $$;
rollback;

-- ── 2. Cleaner cannot move themselves into another tenant ──
begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
set local role authenticated;
select pg_temp.try($$update public.users set owner_id = 'b0000000-0000-0000-0000-000000000001' where id = auth.uid()$$);
reset role;
do $$ begin
  if (select owner_id from public.users where id = 'a0000000-0000-0000-0000-000000000004')
     <> 'a0000000-0000-0000-0000-000000000001' then
    raise exception 'FAIL 2: cleaner changed own owner_id';
  end if;
end $$;
rollback;

-- ── 3. Deactivated cleaner cannot reactivate themselves ──
begin;
update public.users set active = false where id = 'a0000000-0000-0000-0000-000000000004';
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
set local role authenticated;
select pg_temp.try($$update public.users set active = true where id = auth.uid()$$);
reset role;
do $$ begin
  if (select active from public.users where id = 'a0000000-0000-0000-0000-000000000004') then
    raise exception 'FAIL 3: deactivated user reactivated themselves';
  end if;
end $$;
rollback;

-- ── 4. Cleaner can still edit their own profile fields (regression guard) ──
begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
set local role authenticated;
update public.users set full_name = 'Renamed', phone = '555', availability = 'weekends'
 where id = auth.uid();
reset role;
do $$ begin
  if (select full_name from public.users where id = 'a0000000-0000-0000-0000-000000000004') <> 'Renamed' then
    raise exception 'FAIL 4: cleaner could not edit own profile';
  end if;
end $$;
rollback;

-- ── 5. Supervisor cannot promote themselves or change another member's role ──
begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
set local role authenticated;
select pg_temp.try($$update public.users set role = 'admin' where id = auth.uid()$$);
select pg_temp.try($$update public.users set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000004'$$);
reset role;
do $$ begin
  if (select role from public.users where id = 'a0000000-0000-0000-0000-000000000003') <> 'supervisor'
     or (select role from public.users where id = 'a0000000-0000-0000-0000-000000000004') <> 'cleaner' then
    raise exception 'FAIL 5: supervisor changed a role';
  end if;
end $$;
rollback;

-- ── 6. Admin can still change a member's role and active flag (team screen path) ──
begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
set local role authenticated;
update public.users set role = 'supervisor', active = false, is_1099_contractor = true
 where id = 'a0000000-0000-0000-0000-000000000004';
reset role;
do $$ begin
  if (select role from public.users where id = 'a0000000-0000-0000-0000-000000000004') <> 'supervisor' then
    raise exception 'FAIL 6: admin could not change member role';
  end if;
end $$;
rollback;

-- ── 7. Admin cannot create an owner, demote the owner, or deactivate the owner ──
begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
set local role authenticated;
select pg_temp.try($$update public.users set role = 'owner' where id = 'a0000000-0000-0000-0000-000000000004'$$);
select pg_temp.try($$update public.users set role = 'cleaner' where id = 'a0000000-0000-0000-0000-000000000001'$$);
select pg_temp.try($$update public.users set role = 'owner' where id = auth.uid()$$);
select pg_temp.try($$update public.users set active = false where id = 'a0000000-0000-0000-0000-000000000001'$$);
reset role;
do $$ begin
  if not (select active from public.users where id = 'a0000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL 7: admin deactivated the owner';
  end if;
  if (select count(*) from public.users
      where owner_id = 'a0000000-0000-0000-0000-000000000001' and role = 'owner') <> 1
     or (select role from public.users where id = 'a0000000-0000-0000-0000-000000000001') <> 'owner' then
    raise exception 'FAIL 7: admin changed owner status';
  end if;
end $$;
rollback;

-- ── 8. Tenant A staff cannot read tenant B properties ──
begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
set local role authenticated;
do $$ begin
  if exists (select 1 from public.properties where name = 'B house') then
    raise exception 'FAIL 8: tenant A admin can read tenant B property';
  end if;
  if not exists (select 1 from public.properties where name = 'A house') then
    raise exception 'FAIL 8: tenant A admin cannot read own property (policy too strict)';
  end if;
end $$;
rollback;

-- ── 9. Deactivated admin loses database access, not just UI access ──
begin;
update public.users set active = false where id = 'a0000000-0000-0000-0000-000000000002';
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
set local role authenticated;
do $$ begin
  if exists (select 1 from public.properties) then
    raise exception 'FAIL 9: deactivated admin can still read properties';
  end if;
end $$;
rollback;

-- ── 10. Signup metadata cannot grant a role or a tenant ──
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-000000000001', 'attacker@test',
   '{"role":"owner","owner_id":"a0000000-0000-0000-0000-000000000001"}');
do $$ begin
  if (select owner_id from public.users where id = 'c0000000-0000-0000-0000-000000000001')
     = 'a0000000-0000-0000-0000-000000000001' then
    raise exception 'FAIL 10: signup metadata joined an existing tenant';
  end if;
  if (select role from public.users where id = 'c0000000-0000-0000-0000-000000000001') <> 'cleaner' then
    raise exception 'FAIL 10: signup metadata granted a role';
  end if;
end $$;
rollback;

-- ── 11. Service role can still set role and tenant (signup + invite actions) ──
begin;
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-000000000002', 'invitee@test');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
update public.users set role = 'admin', owner_id = 'a0000000-0000-0000-0000-000000000001'
 where id = 'c0000000-0000-0000-0000-000000000002';
update public.users set role = 'owner', owner_id = id
 where id = 'c0000000-0000-0000-0000-000000000002';
reset role;
do $$ begin
  if (select role from public.users where id = 'c0000000-0000-0000-0000-000000000002') <> 'owner' then
    raise exception 'FAIL 11: service role could not set role/tenant';
  end if;
end $$;
rollback;

-- ── 12. Calendar feed tokens are invisible to every signed-in user ──
begin;
insert into public.calendar_feed_tokens (owner_id, token)
values ('a0000000-0000-0000-0000-000000000001', 'secret-token-a');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
set local role authenticated;
do $$
declare leaked boolean := false;
begin
  begin
    leaked := exists (select 1 from public.calendar_feed_tokens);
  exception when insufficient_privilege then leaked := false;
  end;
  if leaked then
    raise exception 'FAIL 12: supervisor can read the owner calendar feed token';
  end if;
end $$;
rollback;

select 'tenant-security: 12 cases passed' as result;
