import { beforeEach, expect, it, vi } from "vitest";
import { generateKeyPair, exportJWK, jwtVerify } from "jose";

const mocks = vi.hoisted(() => ({ getUserById: vi.fn(), createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ auth: { admin: { getUserById: mocks.getUserById } } }) }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" }) }));
import { ownerSession } from "@/lib/agent/tokens";
import { agentSessionUsers } from "@/lib/agent/session-user";

beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("creates short-lived RLS credentials without generating email links or refresh sessions", async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  vi.stubEnv("AGENT_SIGNING_JWK", JSON.stringify({ ...await exportJWK(privateKey), kid: "test-key", alg: "ES256" }));
  const user = { id: "owner-id", email: "owner@example.com" };
  mocks.getUserById.mockResolvedValue({ data: { user }, error: null });
  const client = {};
  mocks.createClient.mockReturnValue(client);
  expect(await ownerSession(user.id)).toBe(client);
  const jwt = await mocks.createClient.mock.calls[0][2].accessToken();
  const { payload } = await jwtVerify(jwt, publicKey, { issuer: "https://example.supabase.co/auth/v1", audience: "authenticated" });
  expect(payload).toMatchObject({ sub: user.id, role: "authenticated" });
  expect(payload.exp! - payload.iat!).toBe(60);
  expect(agentSessionUsers.get(client as never)).toBe(user);
});
it("fails closed when the signing key is absent", async () => {
  vi.stubEnv("AGENT_SIGNING_JWK", "");
  await expect(ownerSession("owner-id")).rejects.toThrow("not configured");
  expect(mocks.createClient).not.toHaveBeenCalled();
});
it("rejects banned owners", async () => {
  vi.stubEnv("AGENT_SIGNING_JWK", JSON.stringify({ alg: "ES256", kid: "test", d: "test" }));
  mocks.getUserById.mockResolvedValue({ data: { user: { banned_until: "2999-01-01T00:00:00Z" } }, error: null });
  await expect(ownerSession("owner-id")).rejects.toThrow("unavailable");
});
