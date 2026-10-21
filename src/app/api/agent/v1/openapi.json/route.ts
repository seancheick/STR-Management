import { NextResponse } from "next/server";

import { agentTools, toolInputSchema } from "@/lib/agent/tools";

/** Public OpenAPI 3.1 description of the agent REST API (no data, no secrets). */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const errorResponse = { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
  const paths = Object.fromEntries(agentTools.map((t) => [`/tools/${t.name}`, {
    post: {
      operationId: t.name,
      summary: t.name.replace(/_/g, " "),
      description: `${t.description}${t.scope === "write" ? " Requires a write token." : ""}`,
      requestBody: { required: true, content: { "application/json": { schema: toolInputSchema(t) } } },
      responses: {
        "200": { description: "Tool result", content: { "application/json": { schema: { type: "object", properties: { result: {} } } } } },
        "400": errorResponse, "401": errorResponse, "403": errorResponse, "422": errorResponse, "500": errorResponse,
      },
    },
  }]));

  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "TurnFlow agent API",
      version: "1.0.0",
      description: "Read the calendar, schedule cleaners and update cleaner payments. Authenticate with a Bearer agent token from Settings → AI agents. Times are ISO 8601; money is US dollars.",
    },
    servers: [{ url: `${origin}/api/agent/v1` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      schemas: { Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] } },
    },
    paths,
  });
}
