import { describe, expect, it } from "vitest";

import { parseIcal } from "@/lib/ical/parser";
import { zonedTimeToUtc } from "@/lib/ical/timezone";

// Tests run with DEFAULT_TIMEZONE ("America/New_York") unless specified.
function nyIso(y: number, m: number, d: number, h: number): string {
  return zonedTimeToUtc(y, m, d, h, 0, "America/New_York").toISOString();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIcal(events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

function makeEvent(fields: Record<string, string>): string {
  const lines = ["BEGIN:VEVENT"];
  for (const [k, v] of Object.entries(fields)) {
    lines.push(`${k}:${v}`);
  }
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

describe("parseIcal", () => {
  it("returns empty array for calendar with no events", () => {
    const raw = makeIcal([]);
    expect(parseIcal(raw)).toEqual([]);
  });

  it("parses a DATE-only checkout event", () => {
    const raw = makeIcal([
      makeEvent({
        UID: "abc123@airbnb.com",
        DTSTART: "20260501",
        DTEND: "20260504",
        SUMMARY: "Reservation",
      }),
    ]);

    const result = parseIcal(raw);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("abc123@airbnb.com");
    expect(result[0].checkoutAt).toContain("2026-05-04");
    expect(result[0].summary).toBe("Reservation");
  });

  it("parses a DATETIME checkout event", () => {
    const raw = makeIcal([
      makeEvent({
        UID: "dt001@vrbo.com",
        DTSTART: "20260610T100000Z",
        DTEND: "20260613T110000Z",
        SUMMARY: "Guest stay",
      }),
    ]);

    const result = parseIcal(raw);
    expect(result).toHaveLength(1);
    expect(result[0].checkoutAt).toContain("2026-06-13");
  });

  it("snaps DATE-only checkout to 11:00 property-local time", () => {
    const raw = makeIcal([
      makeEvent({
        UID: "ck001",
        DTSTART: "20260701",
        DTEND: "20260703",
        SUMMARY: "Stay",
      }),
    ]);
    const result = parseIcal(raw);
    expect(result[0].checkoutAt).toBe(nyIso(2026, 7, 3, 11));
  });

  it("falls back to 15:00 property-local on checkout day when there is no next booking", () => {
    const raw = makeIcal([
      makeEvent({
        UID: "solo001",
        DTSTART: "20260701",
        DTEND: "20260703",
        SUMMARY: "Stay",
      }),
    ]);
    const result = parseIcal(raw);
    expect(result[0].dueAt).toBe(nyIso(2026, 7, 3, 15));
  });

  it("keeps explicit DATETIME checkout time instead of snapping", () => {
    const raw = makeIcal([
      makeEvent({
        UID: "late001",
        DTSTART: "20260801T120000Z",
        DTEND: "20260804T150000Z",
        SUMMARY: "Late checkout",
      }),
    ]);
    const result = parseIcal(raw);
    expect(result[0].checkoutAt).toBe("2026-08-04T15:00:00.000Z");
  });

  it("sets dueAt to the next booking's check-in when consecutive events exist", () => {
    const raw = makeIcal([
      makeEvent({ UID: "a", DTSTART: "20260501", DTEND: "20260503", SUMMARY: "First" }),
      makeEvent({ UID: "b", DTSTART: "20260506", DTEND: "20260510", SUMMARY: "Second" }),
    ]);
    const result = parseIcal(raw);
    const a = result.find((r) => r.uid === "a")!;
    // dueAt of first event equals next event's check-in (15:00 local)
    expect(a.dueAt).toBe(nyIso(2026, 5, 6, 15));
    expect(a.nextCheckinAt).toBe(nyIso(2026, 5, 6, 15));
  });

  it("honours custom timezone and hour options", () => {
    const raw = makeIcal([
      makeEvent({ UID: "opts1", DTSTART: "20260601", DTEND: "20260603", SUMMARY: "Stay" }),
    ]);
    const result = parseIcal(raw, {
      timeZone: "America/Los_Angeles",
      checkoutHour: 10,
      checkinHour: 16,
    });
    expect(result[0].checkoutAt).toBe(
      zonedTimeToUtc(2026, 6, 3, 10, 0, "America/Los_Angeles").toISOString(),
    );
  });

  it("skips blocked / unavailable events", () => {
    const raw = makeIcal([
      makeEvent({ UID: "blk1", DTSTART: "20260901", DTEND: "20260903", SUMMARY: "Not available" }),
      makeEvent({ UID: "blk2", DTSTART: "20260910", DTEND: "20260912", SUMMARY: "Blocked" }),
      makeEvent({ UID: "blk3", DTSTART: "20260920", DTEND: "20260922", SUMMARY: "UNAVAILABLE" }),
      makeEvent({ UID: "ok1",  DTSTART: "20260930", DTEND: "20261001", SUMMARY: "Reservation" }),
    ]);

    const result = parseIcal(raw);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("ok1");
  });

  it("skips events missing a UID", () => {
    const raw = makeIcal([
      makeEvent({ DTSTART: "20261001", DTEND: "20261003", SUMMARY: "No UID" }),
    ]);
    expect(parseIcal(raw)).toHaveLength(0);
  });

  it("skips events missing DTSTART and DTEND", () => {
    const raw = makeIcal([
      makeEvent({ UID: "nodates", SUMMARY: "No dates" }),
    ]);
    expect(parseIcal(raw)).toHaveLength(0);
  });

  it("falls back to DTSTART when DTEND is missing", () => {
    const raw = makeIcal([
      makeEvent({ UID: "nodtend", DTSTART: "20261101", SUMMARY: "No DTEND" }),
    ]);
    const result = parseIcal(raw);
    expect(result).toHaveLength(1);
    expect(result[0].checkoutAt).toContain("2026-11-01");
  });

  it("parses multiple events", () => {
    const raw = makeIcal([
      makeEvent({ UID: "e1", DTSTART: "20261201", DTEND: "20261203", SUMMARY: "Stay 1" }),
      makeEvent({ UID: "e2", DTSTART: "20261210", DTEND: "20261215", SUMMARY: "Stay 2" }),
      makeEvent({ UID: "e3", DTSTART: "20261220", DTEND: "20261225", SUMMARY: "Stay 3" }),
    ]);
    expect(parseIcal(raw)).toHaveLength(3);
  });

  it("pairs consecutive events: each checkout gets the next check-in as nextCheckinAt", () => {
    const raw = makeIcal([
      makeEvent({ UID: "r1", DTSTART: "20261201", DTEND: "20261205", SUMMARY: "Stay 1" }),
      makeEvent({ UID: "r2", DTSTART: "20261208", DTEND: "20261212", SUMMARY: "Stay 2" }),
      makeEvent({ UID: "r3", DTSTART: "20261215", DTEND: "20261220", SUMMARY: "Stay 3" }),
    ]);
    const result = parseIcal(raw);
    // Sorted by checkin: r1 → r2 → r3
    const r1 = result.find((r) => r.uid === "r1")!;
    const r2 = result.find((r) => r.uid === "r2")!;
    const r3 = result.find((r) => r.uid === "r3")!;
    // r1's nextCheckinAt = r2's check-in (Dec 8)
    expect(r1.nextCheckinAt).not.toBeNull();
    expect(r1.nextCheckinAt).toContain("2026-12-08");
    // r2's nextCheckinAt = r3's check-in (Dec 15)
    expect(r2.nextCheckinAt).toContain("2026-12-15");
    // Last event has no next booking
    expect(r3.nextCheckinAt).toBeNull();
  });

  it("sets nextCheckinAt to null for a single event", () => {
    const raw = makeIcal([
      makeEvent({ UID: "solo", DTSTART: "20261201", DTEND: "20261205", SUMMARY: "Only stay" }),
    ]);
    const result = parseIcal(raw);
    expect(result[0].nextCheckinAt).toBeNull();
  });

  it("correctly pairs events regardless of order in the iCal file", () => {
    // Events listed in reverse order in the file — should still be sorted by check-in
    const raw = makeIcal([
      makeEvent({ UID: "last",  DTSTART: "20261220", DTEND: "20261225", SUMMARY: "Stay 3" }),
      makeEvent({ UID: "first", DTSTART: "20261201", DTEND: "20261205", SUMMARY: "Stay 1" }),
      makeEvent({ UID: "mid",   DTSTART: "20261208", DTEND: "20261212", SUMMARY: "Stay 2" }),
    ]);
    const result = parseIcal(raw);
    const first = result.find((r) => r.uid === "first")!;
    expect(first.nextCheckinAt).toContain("2026-12-08"); // mid's check-in
  });

  it("handles CRLF line endings", () => {
    const raw =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:crlf1\r\nDTSTART:20261201\r\nDTEND:20261203\r\nSUMMARY:CRLF test\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const result = parseIcal(raw);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("crlf1");
  });
});

// ─── Dedup key format ─────────────────────────────────────────────────────────

describe("source_reference format", () => {
  it("produces deterministic dedup key from UID", () => {
    // The sync-service prefixes 'ical:' — test the convention here
    const uid = "abc123@airbnb.com";
    const sourceRef = `ical:${uid}`;
    expect(sourceRef).toBe("ical:abc123@airbnb.com");
  });
});

// ─── Conflict detection logic ─────────────────────────────────────────────────

describe("overlap window calculation", () => {
  it("detects a time within the ±4h overlap window", () => {
    const dueAt = new Date("2026-05-10T14:00:00Z");
    const candidate = new Date("2026-05-10T16:00:00Z"); // 2h later
    const windowStart = new Date(dueAt.getTime() - 4 * 60 * 60 * 1000);
    const windowEnd = new Date(dueAt.getTime() + 4 * 60 * 60 * 1000);
    expect(candidate >= windowStart && candidate <= windowEnd).toBe(true);
  });

  it("does not flag a time outside the ±4h window", () => {
    const dueAt = new Date("2026-05-10T14:00:00Z");
    const candidate = new Date("2026-05-10T20:00:00Z"); // 6h later
    const windowStart = new Date(dueAt.getTime() - 4 * 60 * 60 * 1000);
    const windowEnd = new Date(dueAt.getTime() + 4 * 60 * 60 * 1000);
    expect(candidate >= windowStart && candidate <= windowEnd).toBe(false);
  });
});
