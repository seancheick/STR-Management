begin;
insert into auth.users(id,email) values('ab000000-0000-0000-0000-000000000001','pricelabs@test');
update public.users set role='owner',owner_id=id where id='ab000000-0000-0000-0000-000000000001';
do $$
declare t text; r text; n integer;
begin
 foreach r in array array['anon','authenticated'] loop
  if has_function_privilege(r,'public.begin_pricelabs_oauth(uuid,uuid,text,text)','EXECUTE') or has_function_privilege(r,'public.disconnect_pricelabs_oauth(uuid)','EXECUTE') then raise exception 'FAIL OAuth RPC accessible'; end if;
 end loop;
 foreach t in array array['pricelabs_connections','pricelabs_oauth_pending'] loop
  foreach r in array array['anon','authenticated'] loop
   if has_table_privilege(r,'public.'||t,'SELECT') or has_table_privilege(r,'public.'||t,'INSERT') or has_table_privilege(r,'public.'||t,'UPDATE') or has_table_privilege(r,'public.'||t,'DELETE') then raise exception 'FAIL secret table accessible'; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'FAIL missing RLS'; end if;
  if not has_table_privilege('service_role','public.'||t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'FAIL missing service role access'; end if;
 end loop;
 insert into public.pricelabs_connections(owner_id,generation,token_ciphertext,refresh_lease) values('ab000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000002','encrypted','ab000000-0000-0000-0000-000000000003');
 -- Canceling a reconnect preserves the existing token, and disconnect clears both atomically.
 perform public.begin_pricelabs_oauth('ab000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000006','pending-state','pkce');
 if (select token_ciphertext from public.pricelabs_connections where owner_id='ab000000-0000-0000-0000-000000000001')<>'encrypted' then raise exception 'FAIL canceled consent destroyed active grant'; end if;
 perform public.begin_pricelabs_oauth('ab000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000007','new-state','pkce');
 update public.pricelabs_connections set token_ciphertext='stale-callback' where owner_id='ab000000-0000-0000-0000-000000000001' and pending_generation='ab000000-0000-0000-0000-000000000006';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'FAIL earlier callback overwrote newer consent'; end if;
 if exists(select 1 from public.pricelabs_oauth_pending where state_hash='pending-state') then raise exception 'FAIL older pending state survived'; end if;
 -- A stale reader must compare its observed token after another refresh commits.
 update public.pricelabs_connections set token_ciphertext='rotated',refresh_lease=null;
 update public.pricelabs_connections set refresh_lease='ab000000-0000-0000-0000-000000000005'
 where generation='ab000000-0000-0000-0000-000000000002' and token_ciphertext='encrypted' and refresh_lease is null;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'FAIL stale reader acquired rotated token lease'; end if;
 update public.pricelabs_connections set token_ciphertext='encrypted',refresh_lease='ab000000-0000-0000-0000-000000000003';
 -- A reconnect replaces generation; stale refresh cannot overwrite or delete it.
 update public.pricelabs_connections set generation='ab000000-0000-0000-0000-000000000004',refresh_lease=null where owner_id='ab000000-0000-0000-0000-000000000001';
 update public.pricelabs_connections set token_ciphertext='stale' where owner_id='ab000000-0000-0000-0000-000000000001' and generation='ab000000-0000-0000-0000-000000000002' and refresh_lease='ab000000-0000-0000-0000-000000000003';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'FAIL stale refresh overwrote reconnect'; end if;
 delete from public.pricelabs_connections where owner_id='ab000000-0000-0000-0000-000000000001' and generation='ab000000-0000-0000-0000-000000000002' and refresh_lease='ab000000-0000-0000-0000-000000000003';
 if not exists(select 1 from public.pricelabs_connections where token_ciphertext='encrypted') then raise exception 'FAIL stale refresh deleted reconnect'; end if;
 insert into public.pricelabs_oauth_pending values('state','ab000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000004','encrypted',now()+interval '10 minutes');
 delete from public.pricelabs_oauth_pending where state_hash='state' and owner_id='ab000000-0000-0000-0000-000000000005' and expires_at>now();
 get diagnostics n=row_count;
 if n<>0 then raise exception 'FAIL other owner consumed state'; end if;
 delete from public.pricelabs_oauth_pending where state_hash='state' and owner_id='ab000000-0000-0000-0000-000000000001' and expires_at>now();
 get diagnostics n=row_count;
 if n<>1 then raise exception 'FAIL first consumption'; end if;
 delete from public.pricelabs_oauth_pending where state_hash='state';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'FAIL state replay'; end if;
 perform public.disconnect_pricelabs_oauth('ab000000-0000-0000-0000-000000000001');
 if exists(select 1 from public.pricelabs_connections where owner_id='ab000000-0000-0000-0000-000000000001') or exists(select 1 from public.pricelabs_oauth_pending where owner_id='ab000000-0000-0000-0000-000000000001') then raise exception 'FAIL disconnect left state'; end if;
end $$;
select 'PriceLabs service isolation and generation/state fencing passed';
rollback;
