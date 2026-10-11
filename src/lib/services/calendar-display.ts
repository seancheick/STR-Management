import { dateKeyInTimeZone } from "@/lib/ical/timezone";

/** Calendar cells are civil dates, never instants in the viewer's timezone. */
export function calendarDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function calendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calendarInstantKey(iso: string, timezone?: string | null): string {
  return dateKeyInTimeZone(new Date(iso), timezone);
}

/** Include departure day: checkout and next check-in must both be visible. */
export function reservationColumns(startAt: string, endAt: string, days: string[], timezone?: string | null) {
  const start = calendarInstantKey(startAt, timezone);
  const end = calendarInstantKey(endAt, timezone);
  if (!days.length || end < days[0] || start > days[days.length - 1]) return null;
  const startCol = Math.max(0, days.findIndex((day) => day >= start));
  let endCol = days.length - 1;
  while (endCol > 0 && days[endCol] > end) endCol--;
  endCol = Math.max(startCol, endCol);
  return { startCol, endCol, startsInWindow: start >= days[0], endsInWindow: end <= days[days.length - 1] };
}

export function calendarRangeLabel(first: Date, last: Date): string {
  const sameYear = first.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && first.getMonth() === last.getMonth();
  const firstLabel = first.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" as const }) });
  const lastLabel = sameMonth ? `${last.getDate()}, ${last.getFullYear()}` : last.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${firstLabel} – ${lastLabel}`;
}

/** Validate civil export dates and fetch all instants in any property timezone. */
export function calendarWindow(start: string, end: string) {
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!valid(start) || !valid(end) || start > end) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return {
    start, end,
    queryStart: new Date(startMs - 86400000).toISOString(),
    queryEnd: new Date(endMs + 2 * 86400000 - 1).toISOString(),
  };
}

export function calendarWindowContains(iso: string, start: string, end: string, timezone?: string | null) {
  const day = calendarInstantKey(iso, timezone);
  return day >= start && day <= end;
}

/** Bookings keep their listing configuration while internal jobs share a floor. */
export function calendarListingId(record: { property_id: string; listing_property_id?: string | null }): string {
  return record.listing_property_id ?? record.property_id;
}

/** Only outward horizontal gestures at an overflowing viewport edge page dates. */
export function calendarEdgeDirection(scrollLeft: number, scrollWidth: number, clientWidth: number, gestureDelta: number): "previous" | "next" | null {
  const max = scrollWidth - clientWidth;
  if (max <= 2 || !Number.isFinite(gestureDelta) || gestureDelta === 0) return null;
  if (gestureDelta < 0 && scrollLeft <= 2) return "previous";
  if (gestureDelta > 0 && scrollLeft >= max - 2) return "next";
  return null;
}
