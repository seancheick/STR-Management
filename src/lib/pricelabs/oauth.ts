import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { encryptSecret, decryptSecret } from "./crypto";
import * as store from "./store";

const AUTHORIZE = "https://pricelabs.co/oauth/authorize";
const TOKEN = "https://pricelabs.co/oauth/token";
const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
export function getPriceLabsRedirectUri() {
  const url = new URL(process.env.PRICELABS_REDIRECT_URI ?? "");
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) || url.username || url.password || url.search || url.hash || url.pathname !== "/api/integrations/pricelabs/callback") throw new Error("Invalid PriceLabs redirect configuration");
  return url.toString();
}
export function priceLabsOAuthConfigured() {
  try { getPriceLabsRedirectUri(); return Boolean(process.env.PRICELABS_CLIENT_ID && process.env.PRICELABS_CLIENT_SECRET && /^[a-fA-F0-9]{64}$/.test(process.env.PRICELABS_ENCRYPTION_KEY ?? "")); } catch { return false; }
}
type Tokens = { access_token: string; refresh_token: string; expires_in: number; scope?: string; token_type?: string };
async function exchange(fields: Record<string, string>, previousRefresh?: string): Promise<Tokens> {
  if (!priceLabsOAuthConfigured()) throw new Error("PriceLabs is not configured");
  let response: Response;
  try {
    response = await fetch(TOKEN, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...fields, client_id: process.env.PRICELABS_CLIENT_ID!, client_secret: process.env.PRICELABS_CLIENT_SECRET! }) });
    if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 65536) throw new Error();
    if (!response.body) throw new Error();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) { await reader.cancel(); throw new Error(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value.access_token !== "string" || !value.access_token || (value.refresh_token !== undefined && (typeof value.refresh_token !== "string" || !value.refresh_token)) || (!value.refresh_token && !previousRefresh) || typeof value.expires_in !== "number" || !Number.isFinite(value.expires_in) || value.expires_in <= 0 || value.expires_in > 31536000 || (value.scope !== undefined && value.scope !== "read") || (value.token_type !== undefined && String(value.token_type).toLowerCase() !== "bearer")) throw new Error();
    return { ...value, refresh_token: value.refresh_token ?? previousRefresh };
  } catch { throw new Error("PriceLabs authorization failed; reconnect in Settings"); }
}
async function persist(owner: string, generation: string, tokens: Tokens, lease: string | null = null) {
  if (!await store.saveTokens(owner, generation, encryptSecret(owner, "tokens", JSON.stringify(tokens)), new Date(Date.now() + tokens.expires_in * 1000).toISOString(), lease)) throw new Error("PriceLabs connection changed; reconnect in Settings");
}
export async function beginOAuth(ownerId: string) {
  if (!priceLabsOAuthConfigured()) throw new Error("PriceLabs is not configured");
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  await store.startFlow(ownerId, randomUUID(), hash(state), encryptSecret(ownerId, "pkce", verifier));
  const url = new URL(AUTHORIZE);
  url.search = new URLSearchParams({ client_id: process.env.PRICELABS_CLIENT_ID!, redirect_uri: getPriceLabsRedirectUri(), response_type: "code", scope: "read", state, code_challenge: hash(verifier), code_challenge_method: "S256" }).toString();
  return url.toString();
}
export async function completeOAuth(ownerId: string, state: string, code: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096) throw new Error("Invalid PriceLabs authorization state");
  const pending = await store.consumeFlow(ownerId, hash(state));
  if (!pending) throw new Error("Expired or invalid PriceLabs authorization state");
  await persist(ownerId, pending.generation, await exchange({ grant_type: "authorization_code", code, redirect_uri: getPriceLabsRedirectUri(), code_verifier: decryptSecret(ownerId, "pkce", pending.verifier_ciphertext) }));
}
export const disconnectPriceLabs = store.deleteConnection;
export async function getConnectionStatus(ownerId: string): Promise<"connected" | "disconnected" | "reauthorization_required"> {
  const row = await store.readConnection(ownerId);
  if (!row) return "disconnected";
  if (!row.token_ciphertext || (row.refresh_started_at && Date.now() - Date.parse(row.refresh_started_at) > 30_000)) return "reauthorization_required";
  return "connected";
}
export async function hasConnection(ownerId: string) { return Boolean(await store.readConnection(ownerId)); }
export async function getAccessToken(ownerId: string): Promise<string> {
  const row = await store.readConnection(ownerId);
  if (!row?.token_ciphertext) throw new Error("Reconnect PriceLabs in Settings");
  // A stale lease may have rotated its token upstream. Never retry that refresh token.
  if (row.refresh_lease) {
    if (row.refresh_started_at && Date.now() - Date.parse(row.refresh_started_at) > 30_000) await store.invalidateConnection(ownerId, row.generation, row.refresh_lease);
    throw new Error("PriceLabs refresh pending; retry or reconnect in Settings");
  }
  const tokens = JSON.parse(decryptSecret(ownerId, "tokens", row.token_ciphertext)) as Tokens;
  if (row.expires_at && Date.parse(row.expires_at) > Date.now() + 60_000) return tokens.access_token;
  const lease = randomUUID();
  if (!await store.acquireRefresh(ownerId, row.generation, lease, row.token_ciphertext)) throw new Error("PriceLabs refresh pending; retry shortly");
  try {
    const refreshed = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }, tokens.refresh_token);
    await persist(ownerId, row.generation, refreshed, lease);
    return refreshed.access_token;
  } catch {
    await store.invalidateConnection(ownerId, row.generation, lease);
    throw new Error("Reconnect PriceLabs in Settings");
  }
}
