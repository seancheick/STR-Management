import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIcal } from "@/lib/ical/parser";
import { dateKeyInTimeZone } from "@/lib/ical/timezone";

// Dates/blocked metadata retained from actual feeds; guest identities/UIDs removed.
describe("sanitized Hostex feed snapshots", () => {
  it.each([["1st2", 4], ["1st3", 3], ["2nd2", 3], ["2nd3", 0], ["basement", 3]])(
    "%s imports only %s real reservations",
    (listing, expected) => {
      const raw = readFileSync(`tests/fixtures/ical/hostex-${listing}.ics`, "utf8");
      const candidates = parseIcal(raw, { timeZone: "America/New_York" });
      expect(candidates).toHaveLength(expected as number);
      for (const candidate of candidates) {
        expect(candidate.summary).toBe("Reserved: Example Guest");
        expect(dateKeyInTimeZone(new Date(candidate.dueAt))).toBe(dateKeyInTimeZone(new Date(candidate.checkoutAt)));
        expect(new Date(candidate.dueAt).getTime()).toBeGreaterThan(new Date(candidate.checkoutAt).getTime());
      }
    },
  );
});
