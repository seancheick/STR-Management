import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/pricelabs/store", () => ({ startFlow: vi.fn(), consumeFlow: vi.fn(), readConnection: vi.fn(), saveTokens: vi.fn(), acquireRefresh: vi.fn(), invalidateConnection: vi.fn(), deleteConnection: vi.fn() }));
import { encryptSecret, decryptSecret } from "@/lib/pricelabs/crypto";
import * as store from "@/lib/pricelabs/store";
import { beginOAuth, completeOAuth, getAccessToken, priceLabsOAuthConfigured } from "@/lib/pricelabs/oauth";
beforeEach(() => {
  vi.resetAllMocks();
  process.env.PRICELABS_ENCRYPTION_KEY = "ab".repeat(32);
  process.env.PRICELABS_CLIENT_ID = "client";
  process.env.PRICELABS_CLIENT_SECRET = "secret";
  process.env.PRICELABS_REDIRECT_URI = "https://turnflow.test/api/integrations/pricelabs/callback";
});
describe("PriceLabs encrypted owner grants", () => {
  it("authenticates owner, purpose, ciphertext and uses fresh nonces", () => {
    const ciphertext = encryptSecret("a", "tokens", "secret");
    expect(decryptSecret("a", "tokens", ciphertext)).toBe("secret");
    expect(encryptSecret("a", "tokens", "secret")).not.toBe(ciphertext);
    expect(() => decryptSecret("b", "tokens", ciphertext)).toThrow();
    expect(() => decryptSecret("a", "pkce", ciphertext)).toThrow();
    const fields = ciphertext.split("."); fields[3] = Buffer.from("tamper").toString("base64url");
    expect(() => decryptSecret("a", "tokens", fields.join("."))).toThrow();
  });
  it("rejects malformed keys and callback configuration", () => {
    process.env.PRICELABS_ENCRYPTION_KEY = "x".repeat(64);
    expect(() => encryptSecret("a", "tokens", "secret")).toThrow();
    expect(priceLabsOAuthConfigured()).toBe(false);
    process.env.PRICELABS_ENCRYPTION_KEY = "ab".repeat(32);
    process.env.PRICELABS_REDIRECT_URI = "https://evil.test/other";
    expect(priceLabsOAuthConfigured()).toBe(false);
  });
  it("persists only state hash and encrypted owner-bound PKCE", async () => {
    const url = new URL(await beginOAuth("owner"));
    expect(url.origin + url.pathname).toBe("https://pricelabs.co/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("read");
    const args = vi.mocked(store.startFlow).mock.calls[0];
    expect(args[2]).not.toBe(url.searchParams.get("state"));
    expect(decryptSecret("owner", "pkce", args[3])).toHaveLength(64);
    expect(url.searchParams.has("client_secret")).toBe(false);
  });
  it("rejects expired, replayed or other-owner state before exchange", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    vi.mocked(store.consumeFlow).mockResolvedValue(null);
    await expect(completeOAuth("owner", "a".repeat(43), "code")).rejects.toThrow();
    expect(store.consumeFlow).toHaveBeenCalledWith("owner", expect.any(String));
    expect(fetcher).not.toHaveBeenCalled();
  });
});
function row() { return { owner_id: "a", generation: "g1", token_ciphertext: encryptSecret("a", "tokens", JSON.stringify({ access_token: "old", refresh_token: "refresh" })), expires_at: new Date(0).toISOString(), scope: "read", refresh_lease: null, refresh_started_at: null }; }
describe("refresh fencing", () => {
  it("does not exchange if another request acquired the lease", async () => {
    vi.mocked(store.readConnection).mockResolvedValue(row()); vi.mocked(store.acquireRefresh).mockResolvedValue(false);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(getAccessToken("a")).rejects.toThrow("pending"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("compares observed ciphertext when a stale reader acquires after rotation", async () => {
    const stale = row();
    vi.mocked(store.readConnection).mockResolvedValue(stale);
    // Another request has already replaced this ciphertext before lease acquisition.
    vi.mocked(store.acquireRefresh).mockImplementation(async (_owner, _generation, _lease, observed) => {
      expect(observed).toBe(stale.token_ciphertext);
      return false;
    });
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(getAccessToken("a")).rejects.toThrow("pending");
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.invalidateConnection).not.toHaveBeenCalled();
  });
  it("rotates tokens under generation and lease identity", async () => {
    vi.mocked(store.readConnection).mockResolvedValue(row()); vi.mocked(store.acquireRefresh).mockResolvedValue(true); vi.mocked(store.saveTokens).mockResolvedValue(true);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "new", refresh_token: "rotated", expires_in: 3600, scope: "read" })));
    vi.stubGlobal("fetch", fetcher);
    expect(await getAccessToken("a")).toBe("new");
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
    const saved = vi.mocked(store.saveTokens).mock.calls[0];
    expect(saved[1]).toBe("g1"); expect(saved[4]).toEqual(expect.any(String));
    expect(JSON.parse(decryptSecret("a", "tokens", saved[2])).refresh_token).toBe("rotated");
  });
  it("cannot publish a token after disconnect or reconnect changes generation", async () => {
    vi.mocked(store.readConnection).mockResolvedValue(row()); vi.mocked(store.acquireRefresh).mockResolvedValue(true); vi.mocked(store.saveTokens).mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "new", refresh_token: "rotated", expires_in: 3600 }))));
    await expect(getAccessToken("a")).rejects.toThrow("Reconnect");
    expect(store.invalidateConnection).toHaveBeenCalledWith("a", "g1", expect.any(String));
  });
  it("never replays a refresh token after a stale lease", async () => {
    vi.mocked(store.readConnection).mockResolvedValue({ ...row(), refresh_lease: "old-lease", refresh_started_at: new Date(0).toISOString() });
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(getAccessToken("a")).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
    expect(store.invalidateConnection).toHaveBeenCalledWith("a", "g1", "old-lease");
  });
  it("redacts upstream failures and invalidates only the acquired lease", async () => {
    vi.mocked(store.readConnection).mockResolvedValue(row()); vi.mocked(store.acquireRefresh).mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret-token-in-error")));
    await expect(getAccessToken("a")).rejects.toThrow("Reconnect PriceLabs in Settings");
    expect(store.invalidateConnection).toHaveBeenCalledWith("a", "g1", expect.any(String));
  });
});
