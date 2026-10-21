import { NextResponse } from "next/server";
import { getPriceLabsOwner, validPriceLabsOrigin, priceLabsError, priceLabsResult } from "@/lib/pricelabs/auth";
import { beginOAuth } from "@/lib/pricelabs/oauth";

export async function POST(request: Request) {
  if (!validPriceLabsOrigin(request)) return priceLabsError(403);
  const ownerId = await getPriceLabsOwner();
  if (!ownerId) return priceLabsError(403);
  try {
    return NextResponse.redirect(await beginOAuth(ownerId), {
      status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch { return priceLabsResult("failed"); }
}
