import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type Connection = { owner_id: string; generation: string; token_ciphertext: string | null; expires_at: string | null; scope: string; refresh_lease: string | null; refresh_started_at: string | null };
const db = () => createServiceSupabaseClient();
function checked<T>(result: { data: T; error: unknown }) { if (result.error) throw new Error("PriceLabs storage unavailable"); return result.data; }
export async function readConnection(owner: string): Promise<Connection | null> { return checked(await db().from("pricelabs_connections").select("*").eq("owner_id", owner).maybeSingle()); }
export async function startFlow(owner: string, generation: string, hash: string, verifier: string) {
  checked(await db().rpc("begin_pricelabs_oauth", { p_owner: owner, p_generation: generation, p_hash: hash, p_verifier: verifier }));
}
export async function consumeFlow(owner: string, hash: string): Promise<{ generation: string; verifier_ciphertext: string } | null> {
  return checked(await db().from("pricelabs_oauth_pending").delete().eq("owner_id", owner).eq("state_hash", hash).gt("expires_at", new Date().toISOString()).select("generation,verifier_ciphertext").maybeSingle());
}
export async function saveTokens(owner: string, generation: string, ciphertext: string, expiry: string, lease: string | null = null) {
  const values = { token_ciphertext: ciphertext, expires_at: expiry, refresh_lease: null, refresh_started_at: null, updated_at: new Date().toISOString() };
  if (!lease) {
    return Boolean(checked(await db().from("pricelabs_connections").update({ ...values, generation, pending_generation: null }).eq("owner_id", owner).eq("pending_generation", generation).select("owner_id").maybeSingle()));
  }
  return Boolean(checked(await db().from("pricelabs_connections").update(values).eq("owner_id", owner).eq("generation", generation).eq("refresh_lease", lease).select("owner_id").maybeSingle()));
}

export async function acquireRefresh(owner: string, generation: string, lease: string, tokenCiphertext: string) {
  return Boolean(checked(await db().from("pricelabs_connections").update({ refresh_lease: lease, refresh_started_at: new Date().toISOString() }).eq("owner_id", owner).eq("generation", generation).eq("token_ciphertext", tokenCiphertext).is("refresh_lease", null).select("owner_id").maybeSingle()));
}
export async function invalidateConnection(owner: string, generation: string, lease: string) {
  checked(await db().from("pricelabs_connections").update({ token_ciphertext: null, expires_at: null, refresh_lease: null, refresh_started_at: null }).eq("owner_id", owner).eq("generation", generation).eq("refresh_lease", lease));
}
export async function deleteConnection(owner: string) {
  checked(await db().rpc("disconnect_pricelabs_oauth", { p_owner: owner }));
}
