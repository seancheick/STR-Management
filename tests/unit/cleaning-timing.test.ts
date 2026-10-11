import { describe, expect, it } from "vitest";
import { getCleaningTiming } from "@/lib/services/cleaning-timing";
const base = { checkout_at: "2026-10-11T15:00:00Z", due_at: "2026-10-11T19:00:00Z", next_checkin_at: null, properties: { timezone: "America/New_York" } };
describe("cleaning timing", () => {
  it("uses an actual same-day arrival as a firm four-hour window", () => {
    const timing = getCleaningTiming({ ...base, next_checkin_at: "2026-10-11T19:00:00Z" });
    expect(timing).toMatchObject({ mode: "firm", summary: "11 AM–3 PM · 4h window", minutes: 240 });
  });
  it("does not invent a same-day arrival from a default deadline", () => {
    expect(getCleaningTiming(base).detail).toContain("Ready target: 3 PM; timing is flexible.");
    expect(getCleaningTiming(base)).toMatchObject({ mode: "flexible", summary: "After 11 AM · Flexible", deadlineLabel: null });
    expect(getCleaningTiming({ ...base, next_checkin_at: "2026-10-12T19:00:00Z" }).mode).toBe("flexible");
  });
  it("compares local calendar dates and honors recorded times rather than hardcoded hours", () => {
    const timing = getCleaningTiming({ ...base, checkout_at: "2026-10-12T01:00:00Z", next_checkin_at: "2026-10-12T03:00:00Z" });
    expect(timing).toMatchObject({ mode: "firm", summary: "9 PM–11 PM · 2h window", minutes: 120 });
  });
  it("treats a local midnight boundary as flexible even when UTC dates match", () => {
    expect(getCleaningTiming({ ...base, checkout_at: "2026-10-12T03:00:00Z", next_checkin_at: "2026-10-12T05:00:00Z" }).mode).toBe("flexible");
  });
  it("measures elapsed cleaning time correctly across a DST transition", () => {
    expect(getCleaningTiming({ ...base, checkout_at: "2026-11-01T05:00:00Z", next_checkin_at: "2026-11-01T08:00:00Z" })).toMatchObject({ mode: "firm", minutes: 180, summary: "1 AM–3 AM · 3h window" });
  });
  it("retains manual deadlines and flags inverted turnover timestamps", () => {
    expect(getCleaningTiming({ ...base, checkout_at: null }).mode).toBe("manual");
    expect(getCleaningTiming({ ...base, next_checkin_at: "2026-10-11T14:00:00Z" }).mode).toBe("conflict");
  });
});
