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
/** PriceLabs pushes nightly; a day and a half without a push means it stopped. */
export const PRICELABS_PUSH_STALE_HOURS = 36;

/** PriceLabs' own sync record, when a Customer API key is configured. */
export type PriceLabsSync =
  | { ok: true; listings: Array<{ name: string; push_enabled: boolean; last_date_pushed: string | null; channels: Array<{ channel_type: string; listing_id: string }> }> }
  | { ok: false; error: string };
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
  /** Omitted when no PriceLabs key is set: PriceLabs is then judged by price changes like TurnFlow. */
  pricelabs?: PriceLabsSync;
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

  // One staleness finding per active authority. PriceLabs is judged by its own push record when
  // available, because it can push every night without any price changing.
  const changedAt = new Map(updates.map((u) => [`${u.channel_type}:${u.listing_id}`, u.prices_changed_at]));
  for (const authority of ["pricelabs", "turnflow"] as const) {
    const owned = input.listings.filter((l) => l.pricing_authority === authority);
    if (!owned.length) continue;
    if (authority === "pricelabs" && input.pricelabs) {
      const finding = priceLabsSyncFinding(owned, input.listings, input.pricelabs, input.now);
      if (finding) findings.push(finding);
      continue;
    }
    const latest = Math.max(...owned.map((l) => Math.max(Date.parse(l.authority_changed_at), Date.parse(changedAt.get(`${l.channel_type}:${l.listing_id}`) ?? "") || 0)));
    const hours = (input.now.getTime() - latest) / 3_600_000;
    // Unchanged prices only prove TurnFlow's own engine stopped. PriceLabs can push identical
    // prices for days, so without its push record this is a prompt to check, not an outage.
    if (hours > PRICING_STALE_HOURS) findings.push({ rule: "pricing_stale", severity: authority === "pricelabs" ? "warning" : "critical", subject: authority, channel_type: null, start_date: null, end_date: null,
      detail: authority === "pricelabs"
        ? { unverified: true, problem: `PriceLabs has not changed any price in ${Math.floor(hours)} hours`, cause: "Possibly a quiet stretch; PriceLabs can push unchanged prices. Without a connected PriceLabs account its push record is unavailable here", action: "Confirm PriceLabs is still syncing: use the PriceLabs connector for each listing's last_date_pushed, or check Sync status in PriceLabs", listings: owned.length, lastChange: new Date(latest).toISOString() }
        : { problem: `TurnFlow has not changed any price in ${Math.floor(hours)} hours`, cause: "Pricing engine stopped or disconnected", action: "Check the TurnFlow pricing job and its last run", listings: owned.length, lastChange: new Date(latest).toISOString() } });
  }
  return { findings, updates };
}

const normalizeChannel = (channel: string) => channel.toLowerCase().replace(/[^a-z0-9]/g, "");

function priceLabsSyncFinding(owned: ListingSettings[], all: ListingSettings[], sync: PriceLabsSync, now: Date): Finding | null {
  const base = { rule: "pricing_stale" as const, subject: "pricelabs", channel_type: null, start_date: null, end_date: null };
  if (!sync.ok) return { ...base, severity: "warning", detail: { problem: "Could not check PriceLabs sync status", cause: sync.error, unverified: true, action: "Check the PriceLabs connection in Settings; pricing staleness is unverified until this works" } };
  const problems: Array<{ property: string; issue: string; lastPushed: string | null }> = [];
  const ambiguous: number[] = [];
  const invalid: string[] = [];
  for (const propertyId of new Set(owned.map((l) => l.hostex_property_id))) {
    // Match on any channel listing id PriceLabs reports, so a Booking.com-only property still resolves.
    const ids = new Set(all.filter((l) => l.hostex_property_id === propertyId).map((l) => `${normalizeChannel(l.channel_type)}:${l.listing_id}`));
    const matches = sync.listings.filter((p) => p.channels.some((c) => ids.has(`${normalizeChannel(c.channel_type)}:${c.listing_id}`)));
    if (matches.length > 1) { ambiguous.push(propertyId); continue; }
    const match = matches[0];
    const grace = Math.max(...owned.filter((l) => l.hostex_property_id === propertyId).map((l) => Date.parse(l.authority_changed_at)));
    const lastPushed = match?.last_date_pushed ?? null;
    const hours = (now.getTime() - Math.max(grace, Date.parse(lastPushed ?? "") || 0)) / 3_600_000;
    const label = match?.name ?? `Hostex property ${propertyId}`;
    if (!match) problems.push({ property: label, issue: "not found in PriceLabs", lastPushed });
    else if (!match.push_enabled) problems.push({ property: label, issue: "sync turned off in PriceLabs", lastPushed });
    else if (typeof match.push_enabled !== "boolean" || !lastPushed || !Number.isFinite(Date.parse(lastPushed)) || Date.parse(lastPushed) > now.getTime() + 300_000) invalid.push(label);
    else if (hours > PRICELABS_PUSH_STALE_HOURS) problems.push({ property: label, issue: `no push in ${Math.floor(hours)} hours`, lastPushed });
  }
  if (!problems.length && (ambiguous.length || invalid.length)) return { ...base, severity: "warning", detail: { problem: "PriceLabs sync status is unverified", unverified: true, cause: invalid.length ? `Missing or invalid PriceLabs push data: ${invalid.join(", ")}` : `Multiple PriceLabs listings match Hostex properties: ${ambiguous.join(", ")}`, action: "Resolve duplicate channel mappings in PriceLabs, then scan again" } };
  if (!problems.length) return null;
  return { ...base, severity: "critical", detail: {
    problem: `PriceLabs is not pushing prices for ${problems.length} ${problems.length === 1 ? "property" : "properties"}`,
    cause: problems.map((p) => `${p.property}: ${p.issue}`).join("; "),
    action: "Open PriceLabs: check billing, the listing's Sync toggle and its sync error, then Save & Refresh",
    properties: problems, ambiguousProperties: ambiguous,
  } };
}

/** Heartbeat check, used on read: a scanner that silently stops is itself critical. */
export function scanIsStale(lastSuccessAt: string | null, now: Date) {
  if (!lastSuccessAt) return true;
  return (now.getTime() - Date.parse(lastSuccessAt)) / 3_600_000 > SCAN_STALE_HOURS;
}

/** A successful HTTP response is not proof that every requested date was observed. */
export function assertBookabilityCoverage(listings: ListingSettings[], calendars: HostexListingCalendar[], availability: Map<number, Map<string, boolean>>, dates: string[]) {
  for (const listing of listings) {
    const calendar = calendars.find((c) => c.channel_type === listing.channel_type && c.listing_id === listing.listing_id);
    const observedDates = new Set(calendar?.calendar.map((d) => d.date));
    const open = availability.get(listing.hostex_property_id);
    for (const date of dates) {
      if (!observedDates.has(date) || typeof open?.get(date) !== "boolean") throw new Error(`Incomplete Hostex calendar/availability coverage for ${listing.channel_type}:${listing.listing_id} on ${date}; existing findings are preserved.`);
    }
  }
}
