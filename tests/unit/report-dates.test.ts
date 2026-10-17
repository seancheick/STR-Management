import {describe,it,expect} from "vitest";
import {formatReportDate,isJobInReportPeriod} from "@/lib/services/report-dates";
describe("report calendar dates",()=>{
 it("preserves selected dates in the header instead of showing the preceding day",()=>{
  expect(formatReportDate("2099-01-01")).toBe("Jan 1, 2099");
  expect(formatReportDate("2026-10-01")).toBe("Oct 1, 2026");
 });
 it("keeps timestamps in the property timezone",()=>expect(formatReportDate("2026-10-02T02:00:00Z")).toBe("Oct 1, 2026"));
 it("includes a late local job even when its UTC date is next month",()=>expect(isJobInReportPeriod("2026-11-01T03:30:00Z","2026-10-01","2026-10-31","America/New_York")).toBe(true));
 it("excludes a job on the prior local day even when UTC has entered the report month",()=>expect(isJobInReportPeriod("2026-10-01T02:30:00Z","2026-10-01","2026-10-31","America/New_York")).toBe(false));
});
