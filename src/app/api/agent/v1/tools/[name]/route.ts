import { NextResponse } from "next/server";

import { executeAgentTool } from "@/lib/agent/execute";
import { authenticateAgent } from "@/lib/agent/tokens";

/**
 * REST form of the MCP tools for agents that only speak HTTP/OpenAPI
 * (spec at /api/agent/v1/openapi.json). POST the tool's arguments as JSON.
 */
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const auth = await authenticateAgent(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Missing or invalid agent token." }, {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="turnflow"' },
    });
  }
  const { name } = await params;
  const text = await req.text();
  let args: unknown = {};
  if (text.trim()) {
    try {
      args = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }
  }
  const outcome = await executeAgentTool(auth, name, args);
  return outcome.ok
    ? NextResponse.json({ result: outcome.result }, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: outcome.error }, { status: outcome.status });
}
