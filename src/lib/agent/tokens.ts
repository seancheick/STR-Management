import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getEnv } from "@/lib/env";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AgentScope = "read" | "write";
export type AgentAuth = { tokenId: string; ownerId: string; label: string; scope: AgentScope };

const PREFIX = "tf_";

export function newAgentToken() {
  const token = PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashAgentToken(token), prefix: token.slice(0, PREFIX.length + 6) };
}

export function hashAgentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(header: string | null) {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1]?.startsWith(PREFIX) ? match[1] : null;
}

/** Resolves a bearer token to its active, unrevoked owner, or null. */
export async function authenticateAgent(header: string | null): Promise<AgentAuth | null> {
  const token = bearerToken(header);
  if (!token) return null;
  const service = createServiceSupabaseClient();
  const { data: row } = await service
    .from("agent_tokens")
    .select("id, owner_id, label, scope, revoked_at")
    .eq("token_hash", hashAgentToken(token))
    .maybeSingle();
  if (!row || row.revoked_at) return null;
  const { data: owner } = await service
    .from("users")
    .select("id")
    .eq("id", row.owner_id)
    .eq("role", "owner")
    .eq("active", true)
    .maybeSingle();
  if (!owner) return null;
  void service.from("agent_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id).then(
    ({ error }) => error && console.error("[agent-token] last_used_at", error.message),
  );
  return { tokenId: row.id, ownerId: row.owner_id, label: row.label, scope: row.scope as AgentScope };
}

// One signed-in client per owner per server instance, so RLS and the RPCs'
// auth.uid() checks see the owner exactly as the web app does.
const sessions = new Map<string, { client: SupabaseClient; expiresAt: number }>();

/**
 * Returns a client signed in as the owner. The project signs sessions with an
 * asymmetric key we cannot mint with, so we issue a one-time sign-in link with
 * the service role (no email is sent) and redeem it immediately.
 */
const pendingSessions = new Map<string, Promise<SupabaseClient>>();

export async function ownerSession(ownerId: string): Promise<SupabaseClient> {
  const pending = pendingSessions.get(ownerId);
  if (pending) return pending;
  const request = createOwnerSession(ownerId);
  pendingSessions.set(ownerId, request);
  try {
    return await request;
  } finally {
    pendingSessions.delete(ownerId);
  }
}

async function createOwnerSession(ownerId: string): Promise<SupabaseClient> {
  const cached = sessions.get(ownerId);
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.client;

  if (cached) {
    const { data, error } = await cached.client.auth.refreshSession();
    if (!error && data.session?.expires_at) {
      sessions.set(ownerId, { client: cached.client, expiresAt: data.session.expires_at * 1000 });
      return cached.client;
    }
  }

  const service = createServiceSupabaseClient();
  const { data: user, error: userError } = await service.auth.admin.getUserById(ownerId);
  if (userError || !user.user?.email) throw new Error("Could not sign in as the token owner.");
  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email: user.user.email });
  if (linkError || !link.properties?.hashed_token) throw new Error("Could not sign in as the token owner.");

  const env = getEnv();
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error || data.user?.id !== ownerId || !data.session?.expires_at) throw new Error("Could not sign in as the token owner.");
  sessions.set(ownerId, { client, expiresAt: data.session.expires_at * 1000 });
  return client;
}

export type AgentTokenRecord = { id: string; label: string; scope: AgentScope; token_prefix: string; created_at: string; last_used_at: string | null };

/** Active tokens for Settings. Hashes never leave the server. */
export async function listAgentTokens(ownerId: string): Promise<AgentTokenRecord[]> {
  const { data, error } = await createServiceSupabaseClient()
    .from("agent_tokens")
    .select("id, label, scope, token_prefix, created_at, last_used_at")
    .eq("owner_id", ownerId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentTokenRecord[];
}
