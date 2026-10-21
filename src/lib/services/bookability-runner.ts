import "server-only";

import { getAvailabilities, getListingCalendars, getPricingRatios, getProperties } from "@/lib/hostex/client";
import { sendNotification } from "@/lib/notifications/notification-service";
import { getOwnerPriceLabsListings } from "@/lib/pricelabs/client";
import { assertBookabilityCoverage, scanBookability, type Finding, type ListingSettings, type PriceLabsSync } from "@/lib/services/bookability";
import { datesIn } from "@/lib/services/calendar-change-rules";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const DEFAULT_HORIZON_DAYS = 180;

export function localDate(timeZone: string, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export const AUTO_RECHECK_MINUTES = 30;

/**
 * Re-checks Hostex when an open critical finding (or a stale scan) is on screen, at most every
 * AUTO_RECHECK_MINUTES, so a problem fixed in Hostex or the channel clears without waiting for
 * the daily cron. Never throws: it runs after the response, outside any request's error handling.
 */
export async function refreshBookabilityIfDue(ownerId: string) {
  try {
    const { data, error } = await createServiceSupabaseClient().from("bookability_scans").select("started_at")
      .eq("owner_id", ownerId).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (data && Date.now() - Date.parse(data.started_at as string) < AUTO_RECHECK_MINUTES * 60_000) return;
    await runBookabilityScan(ownerId);
  } catch (error) {
    console.error("[bookability-recheck]", error);
  }
}

/** Tenants whose properties are mapped to Hostex. The Hostex token is workspace-wide today. */
export async function listBookabilityOwners(): Promise<string[]> {
  const { data, error } = await createServiceSupabaseClient().from("properties").select("owner_id").not("hostex_property_id", "is", null);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.owner_id as string))];
}

/**
 * Reads every Hostex channel calendar, applies the guardian rules and
 * reconciles findings. Never writes to Hostex. A finding only resolves
 * after a successful scan stops producing it; a failed scan resolves nothing.
 */
export async function runBookabilityScan(ownerId: string, horizonDays = DEFAULT_HORIZON_DAYS) {
  const db = createServiceSupabaseClient();
  const { data: scan, error: scanError } = await db.from("bookability_scans").insert({ owner_id: ownerId, horizon_days: horizonDays }).select("id").single();
  if (scanError) throw scanError;
  const now = new Date();
  try {
    const [properties, mapped] = await Promise.all([
      getProperties(),
      db.from("properties").select("id, hostex_property_id").eq("owner_id", ownerId).eq("active", true).not("hostex_property_id", "is", null),
    ]);
    if (mapped.error) throw mapped.error;
    const propertyOf = new Map((mapped.data ?? []).map((p) => [Number(p.hostex_property_id), p.id as string]));
    const owned = properties.filter((p) => propertyOf.has(p.id));
    if (!owned.length) throw new Error("No Hostex properties are mapped to this workspace.");
    if (owned.length !== propertyOf.size) throw new Error("Hostex did not return every actively mapped property; existing findings are preserved.");

    const ratios = new Map((await Promise.all(owned.map((p) => getPricingRatios(p.id)))).flat().map((r) => [`${r.channel_type}:${r.listing_id}`, r]));
    const upsert = await db.from("channel_listings").upsert(owned.flatMap((p) => p.channels.map((c) => {
      const ratio = ratios.get(`${c.channel_type}:${c.listing_id}`);
      return {
        owner_id: ownerId, hostex_property_id: p.id, property_id: propertyOf.get(p.id), property_title: p.title,
        channel_type: c.channel_type, listing_id: c.listing_id, currency: c.currency,
        listing_title: ratio?.listing_title ?? null, price_readonly: ratio ? ratio.readonly : null, hostex_ratio: ratio && !ratio.readonly ? ratio.ratio : null,
      };
    })), { onConflict: "owner_id,channel_type,listing_id" });
    if (upsert.error) throw upsert.error;
    const { data: listingRows, error: listingError } = await db.from("channel_listings")
      .select("channel_type, listing_id, hostex_property_id, pricing_authority, intentionally_closed, expected_ratio, price_readonly, authority_changed_at, price_snapshot, prices_changed_at")
      .eq("owner_id", ownerId).in("hostex_property_id", owned.map((p) => p.id));
    if (listingError) throw listingError;
    const activeKeys = new Set(owned.flatMap((p) => p.channels.map((c) => `${p.id}:${c.channel_type}:${c.listing_id}`)));
    const listings = (listingRows ?? []).filter((l) => activeKeys.has(`${Number(l.hostex_property_id)}:${l.channel_type}:${l.listing_id}`)).map((l) => ({ ...l, hostex_property_id: Number(l.hostex_property_id), expected_ratio: l.expected_ratio === null ? null : Number(l.expected_ratio) })) as ListingSettings[];

    const timeZone = owned[0]!.timezone || "America/New_York";
    const start = localDate(timeZone), end = localDate(timeZone, horizonDays - 1);
    const [calendars, availabilities] = await Promise.all([
      getListingCalendars(listings.map((l) => ({ channel_type: l.channel_type, listing_id: l.listing_id })), start, end),
      getAvailabilities(owned.map((p) => p.id), start, end),
    ]);
    const availability = new Map(availabilities.map((p) => [p.id, new Map(p.availabilities.map((a) => [a.date, a.available]))]));
    assertBookabilityCoverage(listings, calendars, availability, datesIn({ start_date: start, end_date: end }));
    const pricelabs = listings.some((l) => l.pricing_authority === "pricelabs") ? await priceLabsSync(ownerId) : undefined;
    const { findings, updates } = scanBookability({ listings, calendars, availability, now, pricelabs });

    for (const u of updates) {
      const { error } = await db.from("channel_listings").update({ price_snapshot: u.price_snapshot, prices_changed_at: u.prices_changed_at, last_verified_at: now.toISOString() })
        .eq("owner_id", ownerId).eq("channel_type", u.channel_type).eq("listing_id", u.listing_id);
      if (error) throw error;
    }
    const opened = await reconcileFindings(ownerId, findings, now, true, listings.some((l) => l.pricing_authority === "pricelabs") && (!pricelabs || !pricelabs.ok));
    await db.from("bookability_scans").update({ finished_at: new Date().toISOString(), result: "success", listings_scanned: listings.length }).eq("id", scan.id);
    await notifyCritical(ownerId, opened);
    return { ok: true as const, listings: listings.length, findings: findings.length, newCritical: opened.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from("bookability_scans").update({ finished_at: new Date().toISOString(), result: "failed", error: message.slice(0, 500) }).eq("id", scan.id);
    const opened = await reconcileFindings(ownerId, [{ rule: "scan_stale", severity: "critical", subject: "hostex", channel_type: null, start_date: null, end_date: null,
      detail: { problem: "Bookability scan failed", cause: message.slice(0, 300), action: "Check the Hostex token and API status, then run the scan again" } }], now, false)
      .catch((e) => { console.error("[bookability-scan-failure]", e); return []; });
    await notifyCritical(ownerId, opened);
    return { ok: false as const, error: message };
  }
}

/** PriceLabs' push record for the staleness rule; a PriceLabs outage must not fail the Hostex scan. */
async function priceLabsSync(ownerId: string): Promise<PriceLabsSync | undefined> {
  try {
    const listings = await getOwnerPriceLabsListings(ownerId);
    if (!listings) return undefined;
    return { ok: true, listings: listings.filter((l) => l.pms === "hostex").map((l) => ({
      name: l.name, push_enabled: l.push_enabled, last_date_pushed: l.last_date_pushed ?? null,
      channels: (l.channel_listing_details ?? []).map((c) => ({ channel_type: c.channel_name, listing_id: String(c.channel_listing_id) })),
    })) };
  } catch {
    return { ok: false, error: "PriceLabs sync status could not be verified. Check the connection in Settings and reconnect if needed." };
  }
}

const key = (f: { rule: string; channel_type: string | null; subject: string }) => `${f.rule}|${f.channel_type ?? ""}|${f.subject}`;

async function reconcileFindings(ownerId: string, findings: Finding[], now: Date, scanSucceeded: boolean, preservePriceLabs = false): Promise<Finding[]> {
  const db = createServiceSupabaseClient();
  const at = now.toISOString();
  const { data: openRows, error } = await db.from("bookability_findings").select("id, rule, channel_type, subject, severity, detail").eq("owner_id", ownerId).is("resolved_at", null);
  if (error) throw error;
  const open = new Map((openRows ?? []).map((r) => [key(r), r.id as string]));
  const opened: Finding[] = [];
  for (const f of findings) {
    const previous = (openRows ?? []).find((r) => r.id === open.get(key(f)));
    const retainCritical = f.rule === "pricing_stale" && f.subject === "pricelabs" && (f.detail.unverified === true || preservePriceLabs) && previous?.severity === "critical";
    const fields = { severity: retainCritical ? "critical" : f.severity, start_date: f.start_date, end_date: f.end_date, detail: retainCritical ? { ...f.detail, unverified: true, previousCriticalEvidence: previous.detail?.previousCriticalEvidence ?? previous.detail } : f.detail, last_seen_at: at };
    const id = open.get(key(f));
    let res = id ? await db.from("bookability_findings").update(fields).eq("id", id)
      : await db.from("bookability_findings").insert({ owner_id: ownerId, rule: f.rule, channel_type: f.channel_type, subject: f.subject, first_seen_at: at, ...fields });
    // A concurrent scan opened the same finding first: update it and leave the alert to that scan.
    const raced = !id && res.error?.code === "23505";
    if (raced) {
      let match = db.from("bookability_findings").update(fields).eq("owner_id", ownerId).eq("rule", f.rule).eq("subject", f.subject).is("resolved_at", null);
      match = f.channel_type === null ? match.is("channel_type", null) : match.eq("channel_type", f.channel_type);
      res = await match;
    }
    if (res.error) throw res.error;
    if (!id && !raced && f.severity === "critical") opened.push(f);
    open.delete(key(f));
  }
  if (preservePriceLabs) {
    for (const row of openRows ?? []) if (row.rule === "pricing_stale" && row.subject === "pricelabs" && row.severity === "critical") open.delete(key(row));
  }
  if (scanSucceeded && open.size) {
    const res = await db.from("bookability_findings").update({ resolved_at: at }).in("id", [...open.values()]);
    if (res.error) throw res.error;
  }
  return opened;
}

async function notifyCritical(ownerId: string, findings: Finding[]) {
  if (!findings.length) return;
  const first = findings[0]!;
  await sendNotification({
    ownerId, recipientId: ownerId, assignmentId: null, type: "bookability_alert",
    title: findings.length === 1 ? "Bookability problem found" : `${findings.length} bookability problems found`,
    body: `${first.detail.problem}${first.channel_type ? ` (${first.channel_type} ${first.subject})` : ""}.`,
    url: "/dashboard/health",
  }).catch((e) => console.error("[bookability-notify]", e));
}
