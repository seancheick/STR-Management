import type { HostexListingCalendar } from "@/lib/hostex/client";

/**
 * Bookability Guardian rules. Pure: the runner fetches Hostex data and
 * persists results; this decides what is wrong with which calendar.
 * Only dates the physical property is open for sale are judged, so booked
 * or owner-blocked nights never raise inventory or price alerts.
 */
export type Severity = "critical" | "warning" | "info";
export type Rule = "missing_price" | "closed_while_available" | "ratio_drift" | "restriction_conflict" | "far_out_min_stay" | "pricing_stale" | "scan_stale";
export type PricingAuthority = "pricelabs" | "turnflow" | "manual";

export type ListingSettings = {
  channel_type: string;
  listing_id: string;
  hostex_property_id: number;
  pricing_authority: PricingAuthority;
  intentionally_closed: boolean;
  expected_ratio: number | null;
  /** Hostex readonly: the channel derives this plan's price; API price pushes are rejected. */
  price_readonly?: boolean | null;
  authority_changed_at: string;
  price_snapshot: Record<string, number | null> | null;
  prices_changed_at: string | null;
};

export type DateRange = { start: string; end: string; days: number };
export type Finding = {
  rule: Rule; severity: Severity; subject: string; channel_type: string | null;
  start_date: string | null; end_date: string | null;
  detail: { problem: string; cause: string; action: string; days?: number; ranges?: DateRange[]; [key: string]: unknown };
};
export type ListingUpdate = { channel_type: string; listing_id: string; price_snapshot: Record<string, number | null>; prices_changed_at: string };

export const RATIO_TOLERANCE = 0.02;
export const FAR_OUT_MIN_STAY = 7;
export const PRICING_STALE_HOURS = 72;
export const SCAN_STALE_HOURS = 26;

function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function toRanges(dates: string[]): DateRange[] {
  const sorted = [...dates].sort();
  const out: DateRange[] = [];
  for (const date of sorted) {
    const last = out.at(-1);
    if (last && nextDay(last.end) === date) { last.end = date; last.days++; }
    else out.push({ start: date, end: date, days: 1 });
  }
  return out;
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function dated(rule: Rule, severity: Severity, listing: ListingSettings, dates: string[], text: { problem: string; cause: string; action: string }, extra: Record<string, unknown> = {}): Finding | null {
  if (!dates.length) return null;
  const ranges = toRanges(dates);
  return {
    rule, severity, subject: listing.listing_id, channel_type: listing.channel_type,
    start_date: ranges[0]!.start, end_date: ranges.at(-1)!.end,
    detail: { ...text, days: dates.length, ranges, ...extra },
  };
}

export function scanBookability(input: {
  listings: ListingSettings[];
  calendars: HostexListingCalendar[];
  /** Hostex property id → date → open for sale. */
  availability: Map<number, Map<string, boolean>>;
  now: Date;
}): { findings: Finding[]; updates: ListingUpdate[] } {
  const nowIso = input.now.toISOString();
  const calendarOf = new Map(input.calendars.map((c) => [`${c.channel_type}:${c.listing_id}`, c]));
  const findings: Finding[] = [];
  const updates: ListingUpdate[] = [];
  // Airbnb is each property's reference price; Booking plans are priced relative to it.
  const reference = new Map<number, Map<string, number>>();
  for (const l of input.listings) {
    if (l.channel_type !== "airbnb") continue;
    const cal = calendarOf.get(`${l.channel_type}:${l.listing_id}`);
    if (cal) reference.set(l.hostex_property_id, new Map(cal.calendar.filter((d) => d.price && d.price > 0).map((d) => [d.date, d.price!])));
  }

  for (const l of input.listings) {
    const cal = calendarOf.get(`${l.channel_type}:${l.listing_id}`);
    if (!cal) {
      findings.push({ rule: "missing_price", severity: "critical", subject: l.listing_id, channel_type: l.channel_type, start_date: null, end_date: null,
        detail: { problem: "Hostex returned no calendar for this listing", cause: "Listing unmapped or disconnected in Hostex", action: "Check the channel connection in Hostex" } });
      continue;
    }
    const open = input.availability.get(l.hostex_property_id);
    const sellable = cal.calendar.filter((d) => open?.get(d.date) === true);
    const missing: string[] = [], closed: string[] = [], conflicts: string[] = [], longMin: string[] = [], drift: string[] = [];
    const ratios: Array<{ date: string; ratio: number }> = [];
    const ref = reference.get(l.hostex_property_id);
    for (const d of sellable) {
      const r = d.restrictions;
      if (d.inventory <= 0) { if (!l.intentionally_closed) closed.push(d.date); continue; }
      if (!(d.price && d.price > 0)) missing.push(d.date);
      if (r.closed_on_arrival || r.closed_on_departure
        || (r.min_stay_on_arrival > 0 && r.max_stay_on_arrival > 0 && r.min_stay_on_arrival > r.max_stay_on_arrival)
        || (r.min_stay_through > 0 && r.max_stay_through > 0 && r.min_stay_through > r.max_stay_through)
        || (r.exact_stay_on_arrival > 0 && ((r.min_stay_on_arrival > 0 && r.exact_stay_on_arrival < r.min_stay_on_arrival) || (r.max_stay_on_arrival > 0 && r.exact_stay_on_arrival > r.max_stay_on_arrival)))) conflicts.push(d.date);
      if (r.min_stay_on_arrival >= FAR_OUT_MIN_STAY) longMin.push(d.date);
      const base = ref?.get(d.date);
      if (l.channel_type !== "airbnb" && base && d.price && d.price > 0) ratios.push({ date: d.date, ratio: d.price / base });
    }
    const baseline = l.expected_ratio ?? (ratios.length ? median(ratios.map((x) => x.ratio)) : null);
    if (baseline) for (const x of ratios) if (Math.abs(x.ratio / baseline - 1) > RATIO_TOLERANCE) drift.push(x.date);

    findings.push(...[
      dated("missing_price", "critical", l, missing, l.price_readonly
        ? { problem: "No nightly price on dates open for sale", cause: "Channel-derived rate plan with no working derivation; Hostex cannot price it", action: `Fix this plan's derivation from its parent rate (or deactivate it) in the ${l.channel_type} extranet; API price pushes are rejected` }
        : { problem: "No nightly price on dates open for sale", cause: "Price push missing or rate plan not priced in Hostex", action: "Preview a price correction and apply it only with owner approval" }, { priceReadonly: Boolean(l.price_readonly) }),
      dated("closed_while_available", "warning", l, closed, { problem: "Zero inventory while the property is open", cause: "Channel calendar closed or mapping out of sync", action: "Open inventory in Hostex, or mark this calendar intentionally closed" }),
      dated("ratio_drift", "warning", l, drift, { problem: `Price departs more than ${RATIO_TOLERANCE * 100}% from this plan's usual ratio to Airbnb`, cause: "Rate-plan multiplier changed or a partial price push", action: "Compare against the intended multiplier before changing rates" }, { baseline: Math.round(baseline! * 10_000) / 10_000, baselineSource: l.expected_ratio ? "configured" : "observed median" }),
      dated("restriction_conflict", "warning", l, conflicts, { problem: "Restrictions block or contradict stays on open dates", cause: "Closed to arrival/departure, or min stay above max stay", action: "Review restrictions in Hostex" }),
      dated("far_out_min_stay", "info", l, longMin, { problem: `Minimum stay of ${FAR_OUT_MIN_STAY}+ nights on open dates`, cause: "Far-out minimum-stay rule", action: "Confirm this minimum stay is intended" }),
    ].filter((f): f is Finding => f !== null));

    // Compare only dates both scans cover: the window slides daily even when prices are static.
    const snapshot = Object.fromEntries(cal.calendar.map((d) => [d.date, d.price]));
    const previous = l.price_snapshot;
    const changed = !previous || !l.prices_changed_at || cal.calendar.some((d) => d.date in previous && previous[d.date] !== d.price);
    updates.push({ channel_type: l.channel_type, listing_id: l.listing_id, price_snapshot: snapshot, prices_changed_at: changed ? nowIso : l.prices_changed_at! });
  }

  // One staleness finding per active authority: its prices must move somewhere.
  const changedAt = new Map(updates.map((u) => [`${u.channel_type}:${u.listing_id}`, u.prices_changed_at]));
  for (const authority of ["pricelabs", "turnflow"] as const) {
    const owned = input.listings.filter((l) => l.pricing_authority === authority);
    if (!owned.length) continue;
    const latest = Math.max(...owned.map((l) => Math.max(Date.parse(l.authority_changed_at), Date.parse(changedAt.get(`${l.channel_type}:${l.listing_id}`) ?? "") || 0)));
    const hours = (input.now.getTime() - latest) / 3_600_000;
    if (hours > PRICING_STALE_HOURS) findings.push({ rule: "pricing_stale", severity: "critical", subject: authority, channel_type: null, start_date: null, end_date: null,
      detail: { problem: `${authority === "pricelabs" ? "PriceLabs" : "TurnFlow"} has not changed any price in ${Math.floor(hours)} hours`, cause: "Pricing provider stopped, unpaid or disconnected", action: "Check the provider's sync status and billing", listings: owned.length, lastChange: new Date(latest).toISOString() } });
  }
  return { findings, updates };
}

/** Heartbeat check, used on read: a scanner that silently stops is itself critical. */
export function scanIsStale(lastSuccessAt: string | null, now: Date) {
  if (!lastSuccessAt) return true;
  return (now.getTime() - Date.parse(lastSuccessAt)) / 3_600_000 > SCAN_STALE_HOURS;
}
