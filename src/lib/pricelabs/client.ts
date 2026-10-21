import "server-only";

import { hasConnection, getAccessToken } from "./oauth";
import { getMcpListings } from "./mcp";

/**
 * Read-only PriceLabs Customer API client
 * (https://developers.pricelabs.co/customer-api/api-reference/customer-api/listings/all-listings.md).
 * Used only to confirm PriceLabs is still pushing prices to the channel manager.
 */
export type PriceLabsListing = {
  id: string;
  pms: string;
  name: string;
  push_enabled: boolean;
  last_date_pushed: string | null;
  channel_listing_details: Array<{ channel_name: string; channel_listing_id: string }>;
};

export function priceLabsConfigured(ownerId?: string) {
  return Boolean(ownerId && process.env.PRICELABS_API_KEY && process.env.PRICELABS_API_OWNER_ID === ownerId);
}

/** A saved grant takes precedence; failed grants never silently fall back. */
export async function getOwnerPriceLabsListings(ownerId: string): Promise<PriceLabsListing[] | undefined> {
  if (await hasConnection(ownerId)) return getMcpListings(await getAccessToken(ownerId));
  if (priceLabsConfigured(ownerId)) return getPriceLabsListings();
  return undefined;
}

export async function getPriceLabsListings(): Promise<PriceLabsListing[]> {
  const key = process.env.PRICELABS_API_KEY;
  if (!key) throw new Error("PRICELABS_API_KEY is not configured.");
  const res = await fetch("https://api.pricelabs.co/v1/listings?skip_hidden=true", {
    headers: { "X-API-Key": key },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
    redirect: "error",
  });
  const body = await res.json().catch(() => null) as { listings?: PriceLabsListing[]; error?: { code?: string; message?: string } | string } | null;
  if (!res.ok || !Array.isArray(body?.listings)) {
    const reason = typeof body?.error === "string" ? body.error : body?.error?.code ?? body?.error?.message;
    throw new Error(`PriceLabs /v1/listings failed: ${reason ?? `HTTP ${res.status}`}`);
  }
  return body.listings;
}
