import { describe, expect, it } from "vitest";
import { visibleCalendarReservations } from "../../src/lib/services/calendar-history";
describe("retired calendar history", () => {
  const retired = { active: false, retired_at: "2026-10-09T19:00:00Z" };
  const booking = (end_at: string, source = retired) => ({
    calendar_source_id: "feed",
    end_at,
    source,
  });
  it("restores past stays without reintroducing obsolete futures", () => {
    const past = booking("2026-10-08T15:00:00Z");
    expect(
      visibleCalendarReservations([past, booking("2026-10-14T15:00:00Z")]),
    ).toEqual([{ ...past, historical: true }]);
  });
  it("keeps active reservations and exact historical boundary", () => {
    expect(
      visibleCalendarReservations([
        booking(retired.retired_at),
        booking("2027-01-01T15:00:00Z", {
          active: true,
          retired_at: null as unknown as string,
        }),
      ]),
    ).toHaveLength(2);
  });
});
