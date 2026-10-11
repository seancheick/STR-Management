import { describe, expect, it } from "vitest";
import { planAssignments, planningDateRange } from "@/lib/services/assignment-planning";
const now = "2026-10-11T20:30:00Z";
const job = (id: string, day: string) => ({ id, checkout_at: `${day}T15:00:00Z`, due_at: `${day}T19:00:00Z`, properties: { timezone: "America/New_York" } });
describe("owner assignment planning", () => {
  it("keeps this week separate from next week on Sunday", () => {
    expect(planningDateRange("this-week",now)).toEqual({start:"2026-10-11",end:"2026-10-11"});
    expect(planningDateRange("next-week",now)).toEqual({start:"2026-10-12",end:"2026-10-18"});
  });
  it("next seven days includes today and excludes the eighth day", () => {
    const input = [job("a","2026-10-13"),job("b","2026-10-17"),job("c","2026-10-18")];
    expect(planAssignments(input,"seven-days",now).map(a=>a.id)).toEqual(["a","b"]);
  });
  it("picks the next jobs in checkout order, without mutating input", () => {
    const input = [job("d","2026-10-16"),job("b","2026-10-14"),job("a","2026-10-13"),job("c","2026-10-15")];
    expect(planAssignments(input,"next-three",now).map(a=>a.id)).toEqual(["a","b","c"]);
    expect(input[0].id).toBe("d");
    expect(planAssignments(input,"next-ten",now)).toHaveLength(4);
    expect(planAssignments(input,"next-count",now,2)).toHaveLength(2);
  });
  it("excludes overdue jobs and uses property-local checkout dates", () => {
    const late = { ...job("late","2026-10-18"), checkout_at:"2026-10-18T02:00:00Z" };
    expect(planAssignments([job("old","2026-10-10"),late],"seven-days",now).map(a=>a.id)).toEqual(["late"]);
  });
  it("keeps a seven-day window correct across DST and year boundaries", () => {
    expect(planningDateRange("seven-days","2026-10-31T20:00:00Z")).toEqual({start:"2026-10-31",end:"2026-11-06"});
    expect(planningDateRange("next-week","2026-12-31T20:00:00Z")).toEqual({start:"2027-01-04",end:"2027-01-10"});
  });
});
