/**
 * Minimal iCal (RFC 5545) parser.
 * Extracts VEVENT blocks and normalises them into TurnoverCandidate objects
 * suitable for creating cleaning assignments.
 *
 * Supports:
 *  - DTSTART / DTEND as DATE (YYYYMMDD) or DATETIME (YYYYMMDDTHHmmssZ)
 *  - Multi-line folded values (RFC 5545 §3.1)
 *  - SUMMARY, UID, DESCRIPTION
 *  - Blocked dates (e.g. "Not available" / "Blocked") are skipped
 *  - Timezone-aware snapping: DATE-only events are anchored to property-local
 *    checkout (11:00) and check-in (15:00) by default.
 */

import {
  DEFAULT_CHECKIN_HOUR,
  DEFAULT_CHECKOUT_HOUR,
  DEFAULT_TIMEZONE,
  snapToLocalHour,
  zonedTimeToUtc,
} from "./timezone";

export type ParseIcalOptions = {
  /** IANA timezone to anchor local wall times. Default "America/New_York". */
  timeZone?: string;
  /** Local hour to set on checkout. Default 11. */
  checkoutHour?: number;
  /** Local hour to set on check-in / due. Default 15. */
  checkinHour?: number;
};

export type TurnoverCandidate = {
  /** iCal UID — used as source_reference for dedup */
  uid: string;
  /** ISO string: guest checkout in UTC, representing 11:00 property-local by default */
  checkoutAt: string;
  /**
   * ISO string: cleaning deadline.
   * If a next booking exists, this is the next guest's check-in (15:00 local).
   * Otherwise, the checkout day at 15:00 local.
   */
  dueAt: string;
  /** ISO string: next guest check-in (DTSTART of the following reservation). Null if no next booking. */
  nextCheckinAt: string | null;
  summary: string | null;
  description: string | null;
};

type RawEvent = {
  uid?: string;
  dtstart?: string;
  dtend?: string;
  summary?: string;
  description?: string;
};

type ParsedEvent = TurnoverCandidate & {
  /** ISO string: guest check-in (DTSTART of this reservation) — used internally for pairing */
  checkinAt: string;
};

const BLOCKED_PATTERNS = /not available|blocked|unavailable|maintenance|hold/i;

/** Unfold RFC 5545 line continuations (CRLF + whitespace = continuation). */
function unfold(raw: string): string {
  return raw.replace(/\r?\n[ \t]/g, "");
}

type ParsedIcalDate = {
  date: Date;
  dateOnly: boolean;
  /** Extracted year/month/day (1-based month) for DATE-only values; null for DATETIME. */
  ymd: { year: number; month: number; day: number } | null;
};

/** Parse a DATE or DATETIME value string into a JS Date plus a flag indicating granularity. */
function parseIcalDate(value: string): ParsedIcalDate | null {
  // Strip VALUE=DATE: or TZID= param prefix (e.g. DTSTART;TZID=America/New_York:20260415T110000)
  const bare = value.replace(/^[^:]+:/, "").trim();

  if (/^\d{8}$/.test(bare)) {
    // DATE: YYYYMMDD — anchored at UTC midnight; callers will re-snap to property local.
    const year = Number(bare.slice(0, 4));
    const month = Number(bare.slice(4, 6));
    const day = Number(bare.slice(6, 8));
    const iso = `${bare.slice(0, 4)}-${bare.slice(4, 6)}-${bare.slice(6, 8)}T00:00:00Z`;
    return { date: new Date(iso), dateOnly: true, ymd: { year, month, day } };
  }

  if (/^\d{8}T\d{6}Z?$/.test(bare)) {
    // DATETIME: YYYYMMDDTHHmmss[Z]
    const y = bare.slice(0, 4);
    const mo = bare.slice(4, 6);
    const d = bare.slice(6, 8);
    const h = bare.slice(9, 11);
    const min = bare.slice(11, 13);
    const s = bare.slice(13, 15);
    return {
      date: new Date(`${y}-${mo}-${d}T${h}:${min}:${s}Z`),
      dateOnly: false,
      ymd: null,
    };
  }

  return null;
}

/**
 * Snap a parsed iCal date to a specific local hour.
 * - DATE-only (Airbnb all-day checkout): uses the y-m-d directly in the property TZ.
 * - DATETIME: keeps the explicit time from the feed.
 */
function anchorLocalHour(
  parsed: ParsedIcalDate,
  hour: number,
  timeZone: string,
): Date {
  if (parsed.dateOnly && parsed.ymd) {
    return zonedTimeToUtc(parsed.ymd.year, parsed.ymd.month, parsed.ymd.day, hour, 0, timeZone);
  }
  return parsed.date;
}

export function parseIcal(raw: string, options?: ParseIcalOptions): TurnoverCandidate[] {
  const timeZone = options?.timeZone ?? DEFAULT_TIMEZONE;
  const checkoutHour = options?.checkoutHour ?? DEFAULT_CHECKOUT_HOUR;
  const checkinHour = options?.checkinHour ?? DEFAULT_CHECKIN_HOUR;
  const unfolded = unfold(raw);
  const lines = unfolded.split(/\r?\n/);

  const parsed: ParsedEvent[] = [];
  let inEvent = false;
  let current: RawEvent = {};

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (upper === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }

    if (upper === "END:VEVENT") {
      inEvent = false;

      // Skip blocked / unavailable slots
      if (current.summary && BLOCKED_PATTERNS.test(current.summary)) {
        continue;
      }

      const uid = current.uid;
      if (!uid) continue;

      // DTSTART = guest check-in; DTEND = guest checkout
      if (!current.dtstart) continue;
      const checkinParsed = parseIcalDate(current.dtstart);
      if (!checkinParsed) continue;

      // Use DTEND as the checkout date (guest leaves), fall back to DTSTART
      const checkoutRaw = current.dtend ?? current.dtstart;
      const checkoutParsed = parseIcalDate(checkoutRaw);
      if (!checkoutParsed) continue;

      // Snap DATE-only values to property-local hours (11:00 checkout / 15:00 check-in).
      // For DATETIME values, respect the explicit time from the feed.
      const checkinDate = anchorLocalHour(checkinParsed, checkinHour, timeZone);
      const checkoutDate = anchorLocalHour(checkoutParsed, checkoutHour, timeZone);

      // Fallback dueAt: same day as checkout at check-in hour (used when no next booking pairs).
      const fallbackDue = snapToLocalHour(checkoutDate, checkinHour, 0, timeZone);

      parsed.push({
        uid,
        checkinAt: checkinDate.toISOString(),
        checkoutAt: checkoutDate.toISOString(),
        dueAt: fallbackDue.toISOString(),
        nextCheckinAt: null, // filled in after sorting
        summary: current.summary ?? null,
        description: current.description ?? null,
      });

      continue;
    }

    if (!inEvent) continue;

    // Parse property:value (key may include params, e.g. DTSTART;TZID=...)
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).toUpperCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "UID") current.uid = value;
    else if (key.startsWith("DTSTART")) current.dtstart = line; // full line for param extraction
    else if (key.startsWith("DTEND")) current.dtend = line; // full line for param extraction
    else if (key === "SUMMARY") current.summary = value;
    else if (key === "DESCRIPTION") current.description = value.replace(/\\n/g, "\n");
  }

  // Sort events by check-in date, then pair each checkout with the next check-in
  parsed.sort((a, b) => a.checkinAt.localeCompare(b.checkinAt));
  for (let i = 0; i < parsed.length - 1; i++) {
    parsed[i].nextCheckinAt = parsed[i + 1].checkinAt;
    // Cleaning deadline = next guest's check-in time
    parsed[i].dueAt = parsed[i + 1].checkinAt;
  }

  // Strip the internal checkinAt field before returning
  return parsed.map((event) => ({
    uid: event.uid,
    checkoutAt: event.checkoutAt,
    dueAt: event.dueAt,
    nextCheckinAt: event.nextCheckinAt,
    summary: event.summary,
    description: event.description,
  }));
}
