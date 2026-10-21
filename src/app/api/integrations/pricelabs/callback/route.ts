import { getPriceLabsOwner, priceLabsError, priceLabsResult, priceLabsOrigin } from "@/lib/pricelabs/auth";
import { completeOAuth } from "@/lib/pricelabs/oauth";

export async function GET(request: Request) {
  try { priceLabsOrigin(); } catch { return priceLabsError(503); }
  const ownerId = await getPriceLabsOwner();
  if (!ownerId) return priceLabsError(403);
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (params.has("error") || !state || !code || params.getAll("state").length !== 1 || params.getAll("code").length !== 1 || state.length > 512 || code.length > 2048) {
    return priceLabsResult("failed");
  }
  try { await completeOAuth(ownerId, state, code); return priceLabsResult("connected"); }
  catch { return priceLabsResult("failed"); }
}
