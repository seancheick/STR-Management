import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), maybeSingle: vi.fn(), beginOAuth: vi.fn(), completeOAuth: vi.fn(), disconnectPriceLabs: vi.fn(), client: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mocks.client }));
vi.mock("@/lib/pricelabs/oauth", () => mocks);
import { agentSessionUsers } from "@/lib/agent/session-user";
import { getPriceLabsOwner } from "@/lib/pricelabs/auth";
import { POST as connect } from "@/app/api/integrations/pricelabs/connect/route";
import { POST as disconnect } from "@/app/api/integrations/pricelabs/disconnect/route";
import { GET as callback } from "@/app/api/integrations/pricelabs/callback/route";
const origin = "https://turnflow.example";
const post = (source = origin) => new Request("https://untrusted.example/api/integrations/pricelabs/connect", { method: "POST", headers: { origin: source } });

describe("PriceLabs cookie-owner routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.PRICELABS_REDIRECT_URI = `${origin}/api/integrations/pricelabs/callback`;
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.maybeSingle };
    mocks.client = { auth: { getUser: mocks.getUser }, from: () => query };
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { id: "owner", owner_id: "owner", role: "owner", active: true }, error: null });
    mocks.beginOAuth.mockResolvedValue("https://provider.example/authorize");
    mocks.completeOAuth.mockResolvedValue(undefined);
    mocks.disconnectPriceLabs.mockResolvedValue(undefined);
  });
  it("starts consent for an active self-owned cookie owner", async () => {
    const response = await connect(post());
    expect(response.status).toBe(303);
    expect(mocks.beginOAuth).toHaveBeenCalledWith("owner");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("rejects synthetic agent sessions before getUser", async () => {
    agentSessionUsers.set(mocks.client as never, { id: "owner" } as never);
    expect(await getPriceLabsOwner()).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it.each([
    { id: "owner", owner_id: "other", role: "owner", active: true },
    { id: "owner", owner_id: "owner", role: "admin", active: true },
    { id: "owner", owner_id: "owner", role: "owner", active: false },
  ])("rejects unauthorized profile %j", async (profile) => {
    mocks.maybeSingle.mockResolvedValue({ data: profile, error: null });
    expect((await connect(post())).status).toBe(403);
    expect(mocks.beginOAuth).not.toHaveBeenCalled();
  });
  it("rejects missing cookies and cross-origin mutations", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await callback(new Request(`${origin}/callback?state=s&code=c`))).status).toBe(403);
    expect((await disconnect(post("https://evil.example"))).status).toBe(403);
    expect(mocks.disconnectPriceLabs).not.toHaveBeenCalled();
  });
  it("binds callback to owner and hides invalid-state errors at fixed origin", async () => {
    mocks.completeOAuth.mockRejectedValue(new Error("secret provider error"));
    const response = await callback(new Request("https://evil.example/callback?state=bad&code=secret"));
    expect(mocks.completeOAuth).toHaveBeenCalledWith("owner", "bad", "secret");
    expect(response.headers.get("location")).toBe(`${origin}/dashboard/settings?pricelabs=failed`);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects provider errors and duplicate state without exchange", async () => {
    for (const query of ["?error=denied&error_description=secret", "?state=a&state=b&code=c"]) {
      expect((await callback(new Request(`${origin}/callback${query}`))).headers.get("location")).toContain("pricelabs=failed");
    }
    expect(mocks.completeOAuth).not.toHaveBeenCalled();
  });
  it("redirects successful callback and disconnect to Settings", async () => {
    expect((await callback(new Request(`${origin}/callback?state=s&code=c`))).headers.get("location")).toBe(`${origin}/dashboard/settings?pricelabs=connected`);
    expect((await disconnect(post())).headers.get("location")).toBe(`${origin}/dashboard/settings?pricelabs=disconnected`);
  });
});
