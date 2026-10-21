import { NextResponse } from "next/server";

import { executeAgentTool, toolsForScope } from "@/lib/agent/execute";
import { authenticateAgent } from "@/lib/agent/tokens";
import { toolInputSchema } from "@/lib/agent/tools";

/**
 * Stateless MCP server (Streamable HTTP, JSON responses only) for Claude,
 * Codex, Cursor and other MCP clients. Authenticate with
 * `Authorization: Bearer <agent token>` from Settings → AI agents.
 */
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function POST(req: Request) {
  const auth = await authenticateAgent(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json(rpcError(null, -32001, "Missing or invalid agent token."), {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="turnflow"' },
    });
  }

  let message: RpcRequest;
  try {
    message = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }
  if (Array.isArray(message) || typeof message !== "object" || message === null || typeof message.method !== "string" || message.jsonrpc !== "2.0" || (message.id !== undefined && message.id !== null && typeof message.id !== "string" && typeof message.id !== "number")) {
    return NextResponse.json(rpcError(null, -32600, "Send one JSON-RPC request per POST."), { status: 400 });
  }
  // Notifications (no id) and responses need no reply.
  if (message.id === undefined || message.id === null) return new NextResponse(null, { status: 202 });

  const { id, method, params } = message;
  switch (method) {
    case "initialize": {
      const requested = String(params?.protocolVersion ?? "");
      return NextResponse.json(rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "turnflow", version: "1.0.0" },
        instructions: `Short-term rental turnover operations for ${auth.label} (${auth.scope} access). Times are ISO 8601; money is US dollars. Read before you write: look up ids with list_properties, list_cleaners or get_schedule.`,
      }));
    }
    case "ping":
      return NextResponse.json(rpcResult(id, {}));
    case "tools/list":
      return NextResponse.json(rpcResult(id, {
        tools: toolsForScope(auth).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: toolInputSchema(t),
          annotations: { readOnlyHint: t.scope === "read", destructiveHint: t.scope === "write", openWorldHint: false },
        })),
      }));
    case "tools/call": {
      const outcome = await executeAgentTool(auth, String(params?.name ?? ""), params?.arguments);
      if (!outcome.ok && outcome.status === 404) return NextResponse.json(rpcError(id, -32602, outcome.error));
      return NextResponse.json(rpcResult(id, outcome.ok
        ? { content: [{ type: "text", text: JSON.stringify(outcome.result) }] }
        : { content: [{ type: "text", text: outcome.error }], ...(outcome.details ? {structuredContent:{error:outcome.error,details:outcome.details}} : {}), isError: true }));
    }
    default:
      return NextResponse.json(rpcError(id, -32601, `Method not found: ${method}`));
  }
}

// No server-initiated stream and no sessions to end.
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
