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
 */

export type TurnoverCandidate = {
  /** iCal UID — used as source_reference for dedup */
  uid: string;
  /** ISO string: guest checkout / turnover trigger date (DTEND of this reservation) */
  checkoutAt: string;
  /** ISO string: cleaning due by (same day, 2 PM UTC) */
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

/** Parse a DATE or DATETIME value string into a JS Date. */
function parseIcalDate(value: string): Date | null {
  // Strip VALUE=DATE: or TZID= param prefix (e.g. DTSTART;TZID=America/New_York:20260415T110000)
  const bare = value.replace(/^[^:]+:/, "").trim();

  if (/^\d{8}$/.test(bare)) {
    // DATE: YYYYMMDD — treat as UTC midnight
    const y = bare.slice(0, 4);
    const m = bare.slice(4, 6);
    const d = bare.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00Z`);
  }

  if (/^\d{8}T\d{6}Z?$/.test(bare)) {
    // DATETIME: YYYYMMDDTHHmmss[Z]
    const y = bare.slice(0, 4);
    const mo = bare.slice(4, 6);
    const d = bare.slice(6, 8);
    const h = bare.slice(9, 11);
    const min = bare.slice(11, 13);
    const s = bare.slice(13, 15);
    const tz = bare.endsWith("Z") ? "Z" : "Z"; // treat all as UTC for scheduling
    return new Date(`${y}-${mo}-${d}T${h}:${min}:${s}${tz}`);
  }

  return null;
}

/**
 * Compute dueAt from a checkout date.
 * Default: same day as checkout at 14:00 UTC (2 PM).
 * If the checkout is after 14:00 UTC, push to 15:00 UTC to give a buffer.
 */
function computeDueAt(checkoutDate: Date): Date {
  const due = new Date(checkoutDate);
  const checkoutHour = checkoutDate.getUTCHours();
  due.setUTCHours(checkoutHour >= 14 ? 15 : 14, 0, 0, 0);
  return due;
}

export function parseIcal(raw: string): TurnoverCandidate[] {
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
      const checkinDate = parseIcalDate(current.dtstart);
      if (!checkinDate) continue;

      // Use DTEND as the checkout date (guest leaves), fall back to DTSTART
      const checkoutRaw = current.dtend ?? current.dtstart;
      const checkoutDate = parseIcalDate(checkoutRaw);
      if (!checkoutDate) continue;

      const dueDate = computeDueAt(checkoutDate);

      parsed.push({
        uid,
        checkinAt: checkinDate.toISOString(),
        checkoutAt: checkoutDate.toISOString(),
        dueAt: dueDate.toISOString(),
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
    else if (key.startsWith("DTEND")) current.dtend = line;     // full line for param extraction
    else if (key === "SUMMARY") current.summary = value;
    else if (key === "DESCRIPTION") current.description = value.replace(/\\n/g, "\n");
  }

  // Sort events by check-in date, then pair each checkout with the next check-in
  parsed.sort((a, b) => a.checkinAt.localeCompare(b.checkinAt));
  for (let i = 0; i < parsed.length - 1; i++) {
    parsed[i].nextCheckinAt = parsed[i + 1].checkinAt;
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
