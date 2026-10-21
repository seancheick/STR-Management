-- OAuth secrets are accessible exclusively through the server service role.
create table public.pricelabs_connections (
 owner_id uuid primary key references public.users(id) on delete cascade,
 generation uuid not null,
 pending_generation uuid,
 token_ciphertext text,
 expires_at timestamptz,
 scope text not null default 'read' check(scope='read'),
 refresh_lease uuid,
 refresh_started_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.pricelabs_oauth_pending (
 state_hash text primary key,
 owner_id uuid not null references public.users(id) on delete cascade,
 generation uuid not null,
 verifier_ciphertext text not null,
 expires_at timestamptz not null
);
alter table public.pricelabs_connections enable row level security;
alter table public.pricelabs_oauth_pending enable row level security;
revoke all on public.pricelabs_connections,public.pricelabs_oauth_pending from public,anon,authenticated;
grant all on public.pricelabs_connections,public.pricelabs_oauth_pending to service_role;

-- Starting a new consent preserves any current grant until a successful callback.
create function public.begin_pricelabs_oauth(p_owner uuid,p_generation uuid,p_hash text,p_verifier text)
returns void language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,74119));
 delete from public.pricelabs_oauth_pending where expires_at<=now();
 insert into public.pricelabs_connections(owner_id,generation,pending_generation)
 values(p_owner,p_generation,p_generation)
 on conflict(owner_id) do update set pending_generation=excluded.pending_generation;
 delete from public.pricelabs_oauth_pending where owner_id=p_owner;
 insert into public.pricelabs_oauth_pending(state_hash,owner_id,generation,verifier_ciphertext,expires_at)
 values(p_hash,p_owner,p_generation,p_verifier,now()+interval '10 minutes');
end $$;
create function public.disconnect_pricelabs_oauth(p_owner uuid)
returns void language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,74119));
 -- Serialize against begin's upsert before removing both grant and pending state.
 perform 1 from public.pricelabs_connections where owner_id=p_owner for update;
 delete from public.pricelabs_oauth_pending where owner_id=p_owner;
 delete from public.pricelabs_connections where owner_id=p_owner;
end $$;
revoke all on function public.begin_pricelabs_oauth(uuid,uuid,text,text),public.disconnect_pricelabs_oauth(uuid) from public,anon,authenticated;
grant execute on function public.begin_pricelabs_oauth(uuid,uuid,text,text),public.disconnect_pricelabs_oauth(uuid) to service_role;
