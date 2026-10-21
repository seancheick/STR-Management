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
export function calendarListingId(record: { property_id: string; listing_property_id?: string | null; cleaning_scope_property_id?: string | null }): string {
  return record.cleaning_scope_property_id ?? record.listing_property_id ?? record.property_id;
}

/** Only outward horizontal gestures at an overflowing viewport edge page dates. */
export function calendarEdgeDirection(scrollLeft: number, scrollWidth: number, clientWidth: number, gestureDelta: number): "previous" | "next" | null {
  const max = scrollWidth - clientWidth;
  if (max <= 2 || !Number.isFinite(gestureDelta) || gestureDelta === 0) return null;
  if (gestureDelta < 0 && scrollLeft <= 280) return "previous";
  if (gestureDelta > 0 && scrollLeft >= max - 280) return "next";
  return null;
}

export function calendarAdjacentDays(days: string[], direction: "previous" | "next", count = 14): string[] {
  const anchor = calendarDate(direction === "previous" ? days[0] : days[days.length - 1]);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(anchor);
    day.setDate(anchor.getDate() + (direction === "previous" ? i - count : i + 1));
    return calendarDayKey(day);
  });
}

export function calendarScrollAnchor(scrollLeft: number, prependedDays: number): number {
  return scrollLeft + prependedDays * 140;
}

/** Bounded API requests cover an arbitrarily extended timeline. */
export function calendarWindowChunks(start: string, end: string): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  let cursor = start;
  while (cursor <= end) {
    const last = calendarDate(cursor);
    last.setDate(last.getDate() + 364);
    const chunkEnd = calendarDayKey(last) < end ? calendarDayKey(last) : end;
    chunks.push({ start: cursor, end: chunkEnd });
    const next = calendarDate(chunkEnd);
    next.setDate(next.getDate() + 1);
    cursor = calendarDayKey(next);
  }
  return chunks;
}

/** Refresh removes vanished rows in its window while preserving concurrent extensions. */
export function calendarRefreshRows<T extends { id: string }>(current: T[], incoming: T[], inWindow: (row: T) => boolean): T[] {
  return Array.from(new Map([...current.filter((row) => !inWindow(row)), ...incoming].map((row) => [row.id, row])).values());
}

export function calendarTimelineDays(weekOffset = 0, now = new Date()): string[] {
  const start = calendarDate(calendarInstantKey(now.toISOString()));
  start.setDate(start.getDate() - 1 + weekOffset * 7);
  return Array.from({ length: 14 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return calendarDayKey(day);
  });
}
