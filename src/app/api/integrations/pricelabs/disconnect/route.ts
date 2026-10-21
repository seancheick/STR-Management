import { getPriceLabsOwner, validPriceLabsOrigin, priceLabsError, priceLabsResult } from "@/lib/pricelabs/auth";
import { disconnectPriceLabs } from "@/lib/pricelabs/oauth";

export async function POST(request: Request) {
  if (!validPriceLabsOrigin(request)) return priceLabsError(403);
  const ownerId = await getPriceLabsOwner();
  if (!ownerId) return priceLabsError(403);
  try { await disconnectPriceLabs(ownerId); return priceLabsResult("disconnected"); }
  catch { return priceLabsResult("failed"); }
}
