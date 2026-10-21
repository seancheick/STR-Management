import "server-only";
import type { PriceLabsListing } from "./client";

const ENDPOINT = "https://mcp.pricelabs.co/mcp";
const PROTOCOL = "2025-03-26";
const MAX_BYTES = 2_000_000;
const QUESTION = "Verify all listing channel mappings, price sync status and last successful price push.";
type Obj = Record<string, unknown>;
function object(value: unknown): value is Obj { return value !== null && typeof value === "object" && !Array.isArray(value); }
function fail(): never { throw new Error("PriceLabs MCP verification failed: unsupported or incomplete provider response."); }
function string(value: unknown): string { if (typeof value !== "string" || !value.trim()) return fail(); return value; }
function identifier(value: unknown): string { if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value); return string(value); }

async function boundedBody(response: Response): Promise<string> {
  if (!response.body) return fail();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) return fail();
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function parseJson(value: string): unknown { try { return JSON.parse(value); } catch { return fail(); } }
function rpcResponse(body: string, contentType: string, id: number): Obj {
  const messages: unknown[] = [];
  if (contentType.includes("text/event-stream")) {
    for (const event of body.replace(/\r\n/g, "\n").split("\n\n")) {
      const data = event.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      if (data) messages.push(parseJson(data));
    }
  } else if (contentType.includes("application/json")) messages.push(parseJson(body));
  else return fail();
  const responses = messages.filter(value => object(value) && "id" in value);
  if (responses.length !== 1) return fail();
  const response = responses[0];
  if (!object(response) || response.jsonrpc !== "2.0" || response.id !== id || "error" in response || !object(response.result)) return fail();
  return response.result;
}

// PriceLabs documents get_listings as the complete portfolio. Explicit pagination
// metadata must independently confirm completeness; never treat a first page as all.
function complete(value: Obj, count: number) {
  const blocks = [value];
  if ("pagination" in value) { if (!object(value.pagination)) return fail(); blocks.push(value.pagination); }
  for (const block of blocks) {
    for (const key of ["next_cursor", "nextCursor", "next_page", "nextPage", "next", "has_more", "hasMore", "has_next_page"]) {
      if (key in block && block[key] !== null && block[key] !== false && block[key] !== "") return fail();
    }
    for (const key of ["total", "total_count", "total_listings"]) {
      if (key in block && block[key] !== count) return fail();
    }
    if ("total_pages" in block && block.total_pages !== 1 && !(count === 0 && block.total_pages === 0)) return fail();
    if ("page" in block && block.page !== 1) return fail();
    if ("offset" in block && block.offset !== 0) return fail();
    if ("limit" in block && (typeof block.limit !== "number" || count >= block.limit)) return fail();
  }
}
function records(value: unknown): Obj[] {
  if (Array.isArray(value)) { if (!value.every(object)) return fail(); return value; }
  if (!object(value)) return fail();
  if ("error" in value || value.success === false) return fail();
  const rows = value.listings ?? value.data;
  if (!Array.isArray(rows) || !rows.every(object)) return fail();
  complete(value, rows.length);
  return rows;
}
function toolData(result: Obj): unknown {
  if (result.isError !== undefined && result.isError !== false) return fail();
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (!Array.isArray(result.content) || result.content.length !== 1) return fail();
  const content = result.content[0];
  if (!object(content) || content.type !== "text" || typeof content.text !== "string") return fail();
  return parseJson(content.text);
}
function args(schema: unknown, listing?: { id: string; pms: string }): Obj {
  if (!object(schema) || schema.type !== "object" || !object(schema.properties)) return fail();
  const properties = schema.properties;
  const result: Obj = {};
  if ("question" in properties) result.question = QUESTION;
  if (listing) {
    if (!("listing_id" in properties)) return fail();
    const pmsKey = "pms" in properties ? "pms" : "pms_name" in properties ? "pms_name" : null;
    if (!pmsKey) return fail();
    result.listing_id = listing.id;
    result[pmsKey] = listing.pms;
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || !schema.required.every(key => typeof key === "string" && key in result))) return fail();
  for (const [key, value] of Object.entries(result)) {
    const rule = properties[key];
    if (!object(rule) || rule.type !== typeof value || (Array.isArray(rule.enum) && !rule.enum.includes(value))) return fail();
  }
  // Filter defaults can silently hide disabled/hidden listings, so refuse them.
  if (!listing && Object.values(properties).some(rule => object(rule) && rule.default !== undefined && rule.default !== false && rule.default !== null && rule.default !== "")) return fail();
  return result;
}
function channels(value: unknown): PriceLabsListing["channel_listing_details"] {
  if (!Array.isArray(value)) return fail();
  return value.map(row => {
    if (!object(row)) return fail();
    return { channel_name: string(row.channel_name), channel_listing_id: identifier(row.channel_listing_id) };
  });
}
function timestamp(value: unknown): string | null {
  if (value === null) return null;
  const text = string(value);
  // Require an unambiguous timestamp including timezone, rather than local dates.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return fail();
  const calendar = text.slice(0, 10);
  if (new Date(`${calendar}T00:00:00Z`).toISOString().slice(0, 10) !== calendar) return fail();
  const date = Date.parse(text);
  if (!Number.isFinite(date) || date > Date.now()) return fail();
  return new Date(date).toISOString();
}

export async function getMcpListings(accessToken: string): Promise<PriceLabsListing[]> {
  if (!accessToken || /[\r\n]/.test(accessToken)) return fail();
  let session: string | null = null;
  let protocol = PROTOCOL;
  let sequence = 0;
  async function request(method: string, params?: Obj, notification = false): Promise<Obj> {
    const id = ++sequence;
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": protocol, ...(session ? { "Mcp-Session-Id": session } : {}) },
        body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id }), method, ...(params ? { params } : {}) }),
      });
      if (!response.ok || response.redirected) return fail();
      const receivedSession = response.headers.get("mcp-session-id");
      if (receivedSession) { if (session && session !== receivedSession) return fail(); session = receivedSession; }
      if (notification && response.status === 202) return {};
      return rpcResponse(await boundedBody(response), response.headers.get("content-type") ?? "", id);
    } catch { return fail(); }
  }
  const initialized = await request("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "TurnFlow", version: "1.0.0" } });
  if (initialized.protocolVersion !== PROTOCOL || !object(initialized.capabilities) || !object(initialized.capabilities.tools)) return fail();
  protocol = initialized.protocolVersion;
  await request("notifications/initialized", undefined, true);
  const discovered = await request("tools/list");
  if (!Array.isArray(discovered.tools)) return fail();
  complete(discovered, discovered.tools.length);
  const schemas = new Map<string, unknown>();
  for (const tool of discovered.tools) {
    if (!object(tool) || typeof tool.name !== "string" || schemas.has(tool.name)) return fail();
    schemas.set(tool.name, tool.inputSchema);
  }
  async function call(name: "get_listings" | "get_listing_data", listing?: { id: string; pms: string }) {
    return records(toolData(await request("tools/call", { name, arguments: args(schemas.get(name), listing) })));
  }
  const portfolio = await call("get_listings");
  const seen = new Set<string>();
  const listings: PriceLabsListing[] = [];
  for (const row of portfolio) {
    const id = identifier(row.id ?? row.listing_id);
    const pms = string(row.pms ?? row.pms_name);
    const key = JSON.stringify([id, pms]);
    if (seen.has(key)) return fail();
    seen.add(key);
    const mapping = channels(row.channel_listing_details);
    const detailRows = await call("get_listing_data", { id, pms });
    if (detailRows.length !== 1) return fail();
    const detail = detailRows[0];
    if (identifier(detail.id ?? detail.listing_id) !== id || string(detail.pms ?? detail.pms_name) !== pms || typeof detail.push_enabled !== "boolean") return fail();
    if (detail.channel_listing_details !== undefined && JSON.stringify(channels(detail.channel_listing_details)) !== JSON.stringify(mapping)) return fail();
    listings.push({ id, pms, name: string(row.name ?? row.listing_name), push_enabled: detail.push_enabled, last_date_pushed: timestamp(detail.last_date_pushed), channel_listing_details: mapping });
  }
  return listings;
}
