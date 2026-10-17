import { describe, expect, it } from "vitest";
import { createPayoutReportSchema } from "@/lib/validation/payout-report";
const base = { period_start: "2026-10-01", period_end: "2026-10-31", cleaner_filter: null };
describe("payout report form validation", () => {
  it.each([null, undefined, "", "   "])("accepts absent optional notes and label: %s", (value) => {
    const result = createPayoutReportSchema.parse({ ...base, notes: value, label: value });
    expect(result.notes).toBeNull();
    expect(result.label).toContain("2026-10-01");
  });
  it("trims provided fields", () => {
    expect(createPayoutReportSchema.parse({ ...base, label: " October ", notes: " Note " })).toMatchObject({ label: "October", notes: "Note" });
  });
  it.each(["2026-02-30", "2026-13-01", "2026-2-01", "", null])("rejects invalid date %s", (value) => {
    expect(createPayoutReportSchema.safeParse({ ...base, period_start: value }).success).toBe(false);
  });
  it("rejects reversed ranges", () => {
    expect(createPayoutReportSchema.safeParse({ ...base, period_start: "2026-11-01" }).success).toBe(false);
  });
});
