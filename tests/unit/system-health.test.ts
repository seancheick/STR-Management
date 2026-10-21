import { describe, expect, it } from "vitest";
import { calendarSourceHealth, healthTimeAgo } from "@/lib/services/system-health";

const now = Date.parse("2026-10-21T12:00:00Z");
const recent = { last_synced_at: "2026-10-21T11:00:00Z", sync_logs: { result: "success", conflict_count: 0, error_message: null } };
describe("calendar health", () => {
  it("does not hide a failed latest attempt behind a recent successful sync", () => {
    expect(calendarSourceHealth({ ...recent, sync_logs: { ...recent.sync_logs, result: "failed" } }, now)).toMatchObject({ state: "attention", label: "Sync failed" });
  });
  it("flags partial results and conflicts even with recent activity", () => {
    expect(calendarSourceHealth({ ...recent, sync_logs: { ...recent.sync_logs, result: "partial" } }, now).state).toBe("attention");
    expect(calendarSourceHealth({ ...recent, sync_logs: { ...recent.sync_logs, conflict_count: 1 } }, now).state).toBe("attention");
  });
  it("distinguishes missing evidence from a healthy result", () => {
    expect(calendarSourceHealth({ ...recent, sync_logs: null }, now).state).toBe("unknown");
    expect(calendarSourceHealth({ ...recent, last_synced_at: null }, now).state).toBe("unknown");
    expect(calendarSourceHealth({ ...recent, check_error: true }, now).state).toBe("unknown");
    expect(calendarSourceHealth(recent, now).state).toBe("healthy");
  });
  it("uses the exact daily freshness boundary and rejects future timestamps", () => {
    expect(calendarSourceHealth({ ...recent, last_synced_at: "2026-10-20T08:00:00Z" }, now).label).toBe("Sync overdue");
    expect(calendarSourceHealth({ ...recent, last_synced_at: "2026-10-22T08:00:00Z" }, now).state).toBe("unknown");
  });
  it("does not label a missing or invalid timestamp as recent", () => {
    expect(healthTimeAgo(null, now)).toBe("No recorded activity");
    expect(healthTimeAgo("invalid", now)).toBe("Timestamp unavailable");
    expect(healthTimeAgo("2026-10-22T08:00:00Z", now)).toBe("Timestamp unavailable");
    expect(healthTimeAgo("2026-10-21T11:01:00Z", now)).toBe("59m ago");
  });
});
