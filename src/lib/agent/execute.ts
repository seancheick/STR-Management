import "server-only";

import { z } from "zod/v4";

import { ownerSession, type AgentAuth } from "@/lib/agent/tokens";
import { AgentToolError, agentTools, findAgentTool } from "@/lib/agent/tools";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { runWithSupabaseClient } from "@/lib/supabase/server";

export type AgentCallResult =
  | { ok: true; result: unknown }
  | { ok: false; status: 400 | 403 | 404 | 422 | 500; error: string };

export function toolsForScope(auth: AgentAuth) {
  return agentTools.filter((t) => t.scope === "read" || auth.scope === "write");
}

/** Validates and runs one tool as the token owner. Never throws. */
export async function executeAgentTool(auth: AgentAuth, name: string, args: unknown): Promise<AgentCallResult> {
  const tool = findAgentTool(name);
  if (!tool) return { ok: false, status: 404, error: `Unknown tool: ${name}` };
  if (tool.scope === "write" && auth.scope !== "write") {
    return { ok: false, status: 403, error: "This token is read-only. Create a write token in Settings to make changes." };
  }
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) return { ok: false, status: 400, error: z.prettifyError(parsed.error) };

  let outcome: AgentCallResult;
  try {
    const client = await ownerSession(auth.ownerId);
    const result = await runWithSupabaseClient(client, () => tool.run(parsed.data as never));
    outcome = { ok: true, result: result ?? null };
  } catch (error) {
    if (error instanceof AgentToolError) outcome = { ok: false, status: 422, error: error.message };
    // requireRole() redirects when the owner can no longer use this action.
    else if (String((error as { digest?: unknown })?.digest ?? "").startsWith("NEXT_REDIRECT")) {
      outcome = { ok: false, status: 403, error: "The token owner is not allowed to do this." };
    } else {
      console.error(`[agent:${tool.name}]`, error);
      outcome = { ok: false, status: 500, error: "Something went wrong running this tool." };
    }
  }

  if (tool.scope === "write") {
    const { error } = await createServiceSupabaseClient().from("agent_token_writes").insert({
      token_id: auth.tokenId, tool: tool.name, input: parsed.data, error: outcome.ok ? null : outcome.error,
    });
    if (error) console.error("[agent:write-log]", error.message);
  }
  return outcome;
}
