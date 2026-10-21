import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { importJWK, SignJWT } from "jose";

import { agentSessionUsers } from "@/lib/agent/session-user";
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

/** Create a short-lived owner credential without changing any email OTP or session. */
export async function ownerSession(ownerId: string): Promise<SupabaseClient> {
  const rawKey = process.env.AGENT_SIGNING_JWK;
  if (!rawKey) throw new Error("Agent signing key is not configured.");
  const jwk = JSON.parse(rawKey);
  if (jwk.alg !== "ES256" || !jwk.kid || !jwk.d) throw new Error("Invalid agent signing key.");
  const service = createServiceSupabaseClient();
  const { data, error } = await service.auth.admin.getUserById(ownerId);
  if (error || !data.user || "banned_until" in data.user && typeof data.user.banned_until === "string" && Date.parse(data.user.banned_until) > Date.now()) {
    throw new Error("The token owner is unavailable.");
  }
  const env = getEnv();
  const key = await importJWK({ ...jwk, key_ops: ["sign"] }, "ES256");
  const jwt = await new SignJWT({ role: "authenticated", email: data.user.email })
    .setProtectedHeader({ alg: "ES256", kid: jwk.kid, typ: "JWT" })
    .setSubject(ownerId).setAudience("authenticated")
    .setIssuer(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`)
    .setIssuedAt().setExpirationTime("60s").sign(key);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    accessToken: async () => jwt,
    auth: { persistSession: false, autoRefreshToken: false },
  });
  agentSessionUsers.set(client, data.user);
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
