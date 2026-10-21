-- Revocable personal access tokens for AI agents (MCP and REST at /api/agent).
-- A token acts as the owner who created it, through a real Supabase session,
-- so every existing RLS policy and RPC guard still applies. Only the SHA-256
-- hash is stored; the plaintext is shown once on Settings.
-- RLS is on with no policies: only server code using the service role can
-- read or write tokens, like calendar_feed_tokens.
create table if not exists public.agent_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 60),
  scope text not null check (scope in ('read', 'write')),
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists agent_tokens_owner_idx on public.agent_tokens (owner_id);

alter table public.agent_tokens enable row level security;
revoke all on public.agent_tokens from anon, authenticated;

-- Every write-tool call an agent makes, kept so the owner can see what an
-- agent changed (ledger rows record the owner as created_by, not the agent).
create table if not exists public.agent_token_writes (
  id bigint generated always as identity primary key,
  token_id uuid not null references public.agent_tokens (id) on delete cascade,
  tool text not null,
  input jsonb not null,
  error text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists agent_token_writes_token_idx on public.agent_token_writes (token_id, created_at desc);

alter table public.agent_token_writes enable row level security;
revoke all on public.agent_token_writes from anon, authenticated;
