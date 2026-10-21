import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ScheduleTimeline, type ScheduleTimelineProps } from "@/components/schedule/schedule-timeline";
import { MonthView, type MonthViewProps } from "@/components/schedule/month-view";

vi.mock("@/components/assignments/assignment-drawer-sheet", () => ({ AssignmentDrawerSheet: () => null }));

const property = { id: "floor", name: "1st Floor", active: true, bedrooms: 3, timezone: "America/New_York" };
const assignment = {
  id: "turnover", property_id: "floor", listing_property_id: "floor", cleaner_id: "mary", status: "confirmed", ack_status: "accepted",
  checkout_at: "2026-10-11T15:00:00Z", due_at: "2026-10-11T19:00:00Z", next_checkin_at: "2026-10-11T19:00:00Z",
  cleaners: { full_name: "Mary Maria" }, properties: property,
};
const reservations = [
  { id: "outgoing", property_id: "floor", platform: "airbnb", start_at: "2026-10-10T19:00:00Z", end_at: "2026-10-11T15:00:00Z", guest_name: "Outgoing guest" },
  { id: "incoming", property_id: "floor", platform: "booking", start_at: "2026-10-11T19:00:00Z", end_at: "2026-10-12T15:00:00Z", guest_name: "Incoming guest" },
];

describe("same-day calendar turnover rendering", () => {
  it("keeps the named cleaner in an explicit lower grid lane between split stay bars", () => {
    const props = { todayKey: "2026-10-11", assignments: [assignment], properties: [property], cleaners: [], reservations,
      days: ["2026-10-10", "2026-10-11", "2026-10-12"], weekOffset: 0, selectedPropertyId: null } as unknown as ScheduleTimelineProps;
    const html = renderToStaticMarkup(createElement(ScheduleTimeline, props));
    expect(html).toContain("Mary");
    expect(html).toContain('data-cleaning-event="firm"');
    expect(html).toContain('grid-column:2 / span 1;grid-row:1');
    expect(html).toContain('grid-column:2 / 4;grid-row:1');
    expect(html).toContain('grid-column:4 / 6;grid-row:1');
    expect(html).toContain("clip-path:polygon(8px 0");
  });

  it("keeps month cleaner buttons below all booking stripes without a fixed week height", () => {
    const props = { todayKey: "2026-10-11", assignments: [assignment], properties: [property], cleaners: [], reservations,
      monthDays: Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`), monthOffset: 0, view: "month" } as unknown as MonthViewProps;
    const html = renderToStaticMarkup(createElement(MonthView, props));
    expect(html).toContain("Mary");
    expect(html).toContain('data-cleaning-event="firm"');
    expect(html).toContain("repeat(14, minmax(0, 1fr))");
    expect(html).toContain("clip-path:polygon(8px 0");
    expect(html).not.toContain("max-h-");
  });
});
