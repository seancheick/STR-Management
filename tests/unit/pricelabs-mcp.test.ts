import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getMcpListings } from "@/lib/pricelabs/mcp";
const row = { id: "123", pms: "airbnb", name: "Home", channel_listing_details: [{ channel_name: "airbnb", channel_listing_id: "456" }] };
function mock(options: { sse?: boolean; detail?: object; portfolio?: unknown; wrongId?: boolean; toolError?: boolean; discovery?: object } = {}) {
  const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
    const call = JSON.parse(init.body as string);
    let result: object;
    if (call.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (call.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: { tools: {} } };
    else if (call.method === "tools/list") result = { tools: [
      { name: "get_listings", inputSchema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] } },
      { name: "get_listing_data", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, pms_name: { type: "string" } }, required: ["listing_id", "pms_name"] } },
      { name: "update_listing_data", inputSchema: {} },
    ], ...options.discovery };
    else {
      const data = call.params.name === "get_listings" ? options.portfolio ?? { listings: [row] } : { listings: [{ ...row, push_enabled: true, last_date_pushed: "2026-01-01T00:00:00Z", ...options.detail }] };
      result = { content: [{ type: "text", text: JSON.stringify(data) }], ...(options.toolError ? { isError: true } : {}) };
    }
    const body = JSON.stringify({ jsonrpc: "2.0", id: options.wrongId ? -1 : call.id, result });
    return new Response(options.sse ? `event: message\ndata: ${body}\n\n` : body, { headers: { "content-type": options.sse ? "text/event-stream" : "application/json", "mcp-session-id": "session" } });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());
describe("read-only PriceLabs MCP", () => {
  it.each([false, true])("initializes and reads complete JSON/SSE records (%s)", async sse => {
    const fetcher = mock({ sse });
    expect(await getMcpListings("secret")).toEqual([{ ...row, push_enabled: true, last_date_pushed: "2026-01-01T00:00:00.000Z" }]);
    const calls = fetcher.mock.calls.map(([, init]) => JSON.parse(init.body as string));
    expect(calls.map(call => call.method)).toEqual(["initialize", "notifications/initialized", "tools/list", "tools/call", "tools/call"]);
    expect(calls[4].params).toEqual({ name: "get_listing_data", arguments: { listing_id: "123", pms_name: "airbnb" } });
    expect(fetcher.mock.calls.every(([url, init]) => url === "https://mcp.pricelabs.co/mcp" && init.redirect === "error")).toBe(true);
    expect(fetcher.mock.calls[2][1].headers).toMatchObject({ "Mcp-Session-Id": "session" });
  });
  it.each([
    { wrongId: true }, { toolError: true }, { detail: { push_enabled: "true" } },
    { detail: { last_date_pushed: "2099-01-01T00:00:00Z" } },
    { detail: { last_date_pushed: "nonsense" } }, { detail: { id: "other" } },
    { portfolio: { listings: [row], has_more: true } },
    { portfolio: { listings: [row], pagination: { total: 2 } } },
    { discovery: { next_cursor: "another" } },
    { portfolio: { listings: [row, row] } },
    { portfolio: { listings: [{ ...row, channel_listing_details: undefined }] } },
  ])("rejects unverified responses %#", async options => {
    mock(options);
    await expect(getMcpListings("secret")).rejects.toThrow("verification failed");
  });
  it("redacts upstream failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret")));
    await expect(getMcpListings("secret")).rejects.toThrow("PriceLabs MCP verification failed: unsupported or incomplete provider response.");
  });
});
