/**
 * Timezone-aware helpers for normalizing iCal events to
 * property-local check-in / check-out times.
 *
 * We store timestamps in UTC but callers mean a wall-clock local time
 * ("11 AM checkout", "3 PM next check-in"). This module converts
 * a local y-m-d-h-m in a given IANA TZ into the correct UTC instant,
 * DST-safe.
 */

export const DEFAULT_TIMEZONE = "America/New_York";
export const DEFAULT_CHECKOUT_HOUR = 11;
export const DEFAULT_CHECKIN_HOUR = 15;

/**
 * Return the UTC Date that represents `year-month-day hour:minute`
 * in the given IANA timezone. Handles DST transitions correctly by
 * computing the effective offset at that instant (not today's offset).
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  // Start with an assumption that the wall time matches UTC.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Ask the target TZ what "guess" would be displayed as locally.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(guess);

  const dict = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<
    string,
    string
  >;
  const tzHour = dict.hour === "24" ? 0 : Number(dict.hour);

  const actualAsUtcMs = Date.UTC(
    Number(dict.year),
    Number(dict.month) - 1,
    Number(dict.day),
    tzHour,
    Number(dict.minute),
    Number(dict.second),
  );
  const wantedAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Difference tells us how much the guess is offset in the TZ vs UTC.
  // Shift the guess by that delta to land on the true UTC for the wanted local time.
  return new Date(guess.getTime() + (wantedAsUtcMs - actualAsUtcMs));
}

/**
 * Snap any Date to a specific local hour:minute in the given TZ,
 * keeping the date portion as interpreted in that TZ.
 *
 * Example: snapToLocalHour(Date("2026-05-04T00:00Z"), 11, 0, "America/New_York")
 *   → Date representing 2026-05-04 11:00 America/New_York (i.e. 15:00 UTC).
 */
export function snapToLocalHour(
  date: Date,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const dict = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<
    string,
    string
  >;
  return zonedTimeToUtc(
    Number(dict.year),
    Number(dict.month),
    Number(dict.day),
    hour,
    minute,
    timeZone,
  );
}
