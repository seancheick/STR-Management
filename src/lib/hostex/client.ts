import "server-only";

/**
 * Hostex Open API v3 client (spec: https://hostex.io/open_api/v3/config.json).
 * Write methods are only called from the owner-approved calendar-change flow;
 * Hostex accepts writes asynchronously, so success must be verified by reading back.
 */
const BASE = "https://api.hostex.io/v3";

export type HostexChannel = { channel_type: string; listing_id: string; currency: string };
export type HostexProperty = { id: number; title: string; timezone: string; channels: HostexChannel[] };
export type HostexRestrictions = {
  min_stay_on_arrival: number; max_stay_on_arrival: number;
  min_stay_through: number; max_stay_through: number;
  exact_stay_on_arrival: number;
  closed_on_arrival: boolean; closed_on_departure: boolean;
};
export type HostexCalendarDay = { date: string; price: number | null; inventory: number; restrictions: HostexRestrictions };
export type HostexListingCalendar = { listing_id: string; channel_type: string; calendar: HostexCalendarDay[] };
export type HostexAvailability = { id: number; availabilities: Array<{ date: string; available: boolean }> };

async function hostex<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.HOSTEX_API_TOKEN;
  if (!token) throw new Error("HOSTEX_API_TOKEN is not configured.");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Hostex-Access-Token": token, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const body = await res.json().catch(() => null) as { error_code?: number; error_msg?: string; data?: T } | null;
  // Write endpoints answer with no data; read callers check for their payload.
  if (!res.ok || body?.error_code !== 200) {
    throw new Error(`Hostex ${path.split("?")[0]} failed: ${body?.error_msg ?? `HTTP ${res.status}`}`);
  }
  return body.data as T;
}

function need<T>(value: T | undefined, path: string): T {
  if (value === undefined) throw new Error(`Hostex ${path} returned no data.`);
  return value;
}

export async function getProperties(): Promise<HostexProperty[]> {
  return need((await hostex<{ properties?: HostexProperty[] }>("/properties"))?.properties, "/properties");
}

export async function getListingCalendars(listings: Array<{ channel_type: string; listing_id: string }>, start: string, end: string) {
  const data = await hostex<{ listings?: HostexListingCalendar[] }>("/listings/calendar", {
    method: "POST",
    body: JSON.stringify({ start_date: start, end_date: end, listings }),
  });
  return need(data?.listings, "/listings/calendar");
}

export async function getAvailabilities(propertyIds: number[], start: string, end: string) {
  const q = new URLSearchParams({ property_ids: propertyIds.join(","), start_date: start, end_date: end });
  return need((await hostex<{ properties?: HostexAvailability[] }>(`/availabilities?${q}`))?.properties, "/availabilities");
}

export type HostexPricingRatio = { channel_type: string; listing_id: string; listing_title?: string; ratio: number; readonly: boolean };

/** Per-listing ratio (%) to the property base price; readonly listings are priced by the channel. */
export async function getPricingRatios(propertyId: number) {
  return need((await hostex<{ channels?: HostexPricingRatio[] }>(`/pricing_ratios?property_id=${propertyId}`))?.channels, "/pricing_ratios");
}

export type HostexRestrictionUpdate = Partial<Pick<HostexRestrictions, "min_stay_on_arrival" | "max_stay_on_arrival" | "min_stay_through" | "max_stay_through" | "closed_on_arrival" | "closed_on_departure">>;

/** Asynchronous on Hostex's side: a resolved promise means "accepted", not "applied". */
export async function updateListingPrices(channel_type: string, listing_id: string, prices: Array<{ start_date: string; end_date: string; price: number }>) {
  await hostex<unknown>("/listings/prices", { method: "POST", body: JSON.stringify({ channel_type, listing_id, prices }) });
}

export async function updateListingRestrictions(channel_type: string, listing_id: string, restrictions: Array<{ start_date: string; end_date: string } & HostexRestrictionUpdate>) {
  await hostex<unknown>("/listings/restrictions", { method: "POST", body: JSON.stringify({ channel_type, listing_id, restrictions }) });
}
