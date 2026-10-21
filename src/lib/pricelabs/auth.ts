import "server-only";

import { NextResponse } from "next/server";
import { agentSessionUsers } from "@/lib/agent/session-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Consent requires the owner's real browser session, never an agent token. */
export async function getPriceLabsOwner(): Promise<string | null> {
  const client = await createServerSupabaseClient();
  if (agentSessionUsers.has(client)) return null;
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const { data, error: profileError } = await client.from("users")
    .select("id, owner_id, role, active").eq("id", user.id).maybeSingle();
  return !profileError && data?.active === true && data.role === "owner" &&
    data.id === user.id && data.owner_id === user.id ? user.id : null;
}

export function priceLabsOrigin(): string {
  const url = new URL(process.env.PRICELABS_REDIRECT_URI ?? "");
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
      url.username || url.password || url.pathname !== "/api/integrations/pricelabs/callback" || url.search || url.hash) {
    throw new Error("PriceLabs configuration unavailable");
  }
  return url.origin;
}

export function validPriceLabsOrigin(request: Request): boolean {
  try { return request.headers.get("origin") === priceLabsOrigin(); } catch { return false; }
}

export function priceLabsResult(outcome: "connected" | "disconnected" | "failed") {
  return NextResponse.redirect(new URL(`/dashboard/settings?pricelabs=${outcome}`, priceLabsOrigin()), {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export function priceLabsError(status: number) {
  return NextResponse.json({ error: "PriceLabs connection unavailable" }, {
    status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
