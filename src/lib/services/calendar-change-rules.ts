import type { HostexCalendarDay, HostexRestrictionUpdate } from "@/lib/hostex/client";

/**
 * Pure rules for owner-approved Hostex calendar changes: what may be sent,
 * and whether a read-back shows it landed. No I/O here.
 */
export type ChangeKind = "price" | "restrictions";
export const RESTRICTION_FIELDS = ["min_stay_on_arrival", "max_stay_on_arrival", "min_stay_through", "max_stay_through", "closed_on_arrival", "closed_on_departure"] as const;
export type RestrictionField = (typeof RESTRICTION_FIELDS)[number];
export type ChangeRange = { start_date: string; end_date: string; price?: number } & HostexRestrictionUpdate;
export type ChangeTarget = { pricing_authority: string; price_readonly: boolean | null; channel_type: string };

export const MAX_RANGES = 50;
export const MAX_HORIZON_DAYS = 1_095;
export const LARGE_PRICE_CHANGE = 0.4;

const DAY = 86_400_000;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const validDate = (d: string) => isoDate.test(d) && Number.isFinite(toTime(d)) && new Date(toTime(d)).toISOString().slice(0, 10) === d;

export function datesIn(range: { start_date: string; end_date: string }) {
  const out: string[] = [];
  for (let t = toTime(range.start_date); t <= toTime(range.end_date); t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function changeSpan(ranges: ChangeRange[]) {
  const starts = ranges.map((r) => r.start_date).sort(), ends = ranges.map((r) => r.end_date).sort();
  return { start: starts[0]!, end: ends.at(-1)! };
}

/** Refusals are returned, never thrown, so a preview can show every problem at once. */
export function validateChange(kind: ChangeKind, ranges: ChangeRange[], target: ChangeTarget, today: string): string[] {
  const errors: string[] = [];
  if (!ranges.length || ranges.length > MAX_RANGES) errors.push(`Send between 1 and ${MAX_RANGES} date ranges.`);
  if (kind === "price") {
    if (target.price_readonly === null) errors.push("This calendar's price control is unknown. Run run_bookability_scan first.");
    if (target.price_readonly) errors.push(`This rate plan is priced by ${target.channel_type} from a parent rate (Hostex readonly). Fix its derivation in the channel extranet; Hostex rejects API price pushes for it.`);
    if (target.pricing_authority === "pricelabs") errors.push("PriceLabs is this calendar's pricing authority and would overwrite a manual price. Change the authority with update_channel_listing first, with owner approval.");
  }
  const limit = new Date(toTime(today) + MAX_HORIZON_DAYS * DAY).toISOString().slice(0, 10);
  const seen = new Set<string>();
  ranges.forEach((r, i) => {
    const at = `Range ${i + 1}`;
    if (!validDate(r.start_date) || !validDate(r.end_date)) { errors.push(`${at}: dates must be YYYY-MM-DD.`); return; }
    if (r.end_date < r.start_date) errors.push(`${at}: end_date is before start_date.`);
    if (r.start_date < today) errors.push(`${at}: starts in the past (${today} is today).`);
    if (r.end_date > limit) errors.push(`${at}: ends more than three years ahead.`);
    const fields = RESTRICTION_FIELDS.filter((f) => r[f] !== undefined);
    if (kind === "price") {
      if (fields.length) errors.push(`${at}: a price change cannot also change restrictions; send them as a separate restrictions change.`);
      if (!Number.isInteger(r.price) || r.price! < 1 || r.price! > 100_000) errors.push(`${at}: price must be a whole amount in the listing currency (Hostex accepts integers only).`);
    } else {
      if (r.price !== undefined) errors.push(`${at}: a restrictions change cannot include a price.`);
      if (!fields.length) errors.push(`${at}: include at least one restriction to change.`);
      for (const f of fields) {
        const v = r[f];
        if (f.startsWith("closed_") ? typeof v !== "boolean" : !Number.isInteger(v) || (v as number) < 0 || (v as number) > 365) errors.push(`${at}: ${f} is invalid.`);
      }
      for (const suffix of ["on_arrival", "through"] as const) {
        const min = r[`min_stay_${suffix}`], max = r[`max_stay_${suffix}`];
        if (min && max && min > max) errors.push(`${at}: min_stay_${suffix} is above max_stay_${suffix}.`);
      }
    }
    if (r.end_date >= r.start_date && r.end_date <= limit) for (const d of datesIn(r)) {
      if (seen.has(d)) { errors.push(`${at}: overlaps another range on ${d}.`); break; }
      seen.add(d);
    }
  });
  return errors;
}

/** Large swings are allowed but must be visible to the approving owner. */
export function priceWarnings(ranges: ChangeRange[], current: Map<string, HostexCalendarDay>): string[] {
  const out: string[] = [];
  for (const r of ranges) {
    if (r.price === undefined) continue;
    const swings = datesIn(r).filter((d) => { const p = current.get(d)?.price; return p && Math.abs(r.price! / p - 1) > LARGE_PRICE_CHANGE; });
    if (swings.length) out.push(`${r.start_date}–${r.end_date}: ${swings.length} nights change by more than ${LARGE_PRICE_CHANGE * 100}% from the current price.`);
  }
  return out;
}

export type Mismatch = { date: string; field: string; requested: unknown; observed: unknown };

export function compareReadback(kind: ChangeKind, ranges: ChangeRange[], observed: Map<string, HostexCalendarDay>): Mismatch[] {
  const out: Mismatch[] = [];
  for (const r of ranges) for (const date of datesIn(r)) {
    const day = observed.get(date);
    if (kind === "price") {
      if (day?.price !== r.price) out.push({ date, field: "price", requested: r.price, observed: day?.price ?? null });
    } else for (const f of RESTRICTION_FIELDS) {
      if (r[f] !== undefined && day?.restrictions[f] !== r[f]) out.push({ date, field: f, requested: r[f], observed: day?.restrictions[f] ?? null });
    }
  }
  return out;
}

/** The prior values for exactly the dates being changed, so a reversal can be prepared later. */
export function beforeSnapshot(kind: ChangeKind, ranges: ChangeRange[], current: Map<string, HostexCalendarDay>) {
  return Object.fromEntries(ranges.flatMap(datesIn).map((d) => {
    const day = current.get(d);
    return [d, kind === "price" ? day?.price ?? null : Object.fromEntries(RESTRICTION_FIELDS.map((f) => [f, day?.restrictions[f] ?? null]))];
  }));
}

/** Key-order-independent equality: Postgres jsonb does not preserve key order. */
export function samePayload(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, canon(x)])) : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/** Validate the resulting calendar, including restrictions omitted from a partial update. */
export function validateObservedChange(kind: ChangeKind, ranges: ChangeRange[], current: Map<string, HostexCalendarDay>): string[] {
  const errors: string[] = [];
  for (const range of ranges) for (const date of datesIn(range)) {
    const day = current.get(date);
    if (!day) { errors.push(`${date}: Hostex returned no current calendar data; cannot safely change this date.`); continue; }
    if (kind !== "restrictions") continue;
    const merged = { ...day.restrictions, ...Object.fromEntries(RESTRICTION_FIELDS.filter((f) => range[f] !== undefined).map((f) => [f, range[f]])) };
    for (const suffix of ["on_arrival", "through"] as const) {
      const min = merged[`min_stay_${suffix}`], max = merged[`max_stay_${suffix}`];
      if (min > 0 && max > 0 && min > max) errors.push(`${date}: resulting min_stay_${suffix} is above max_stay_${suffix}.`);
    }
    const exact = merged.exact_stay_on_arrival;
    if (exact > 0 && ((merged.min_stay_on_arrival > 0 && exact < merged.min_stay_on_arrival) || (merged.max_stay_on_arrival > 0 && exact > merged.max_stay_on_arrival))) errors.push(`${date}: resulting stay bounds contradict exact_stay_on_arrival.`);
  }
  return errors;
}
