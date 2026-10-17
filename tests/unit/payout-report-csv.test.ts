import { expect, it } from "vitest";
import { reportCsvCell } from "@/lib/services/payout-report-csv";
it("quotes commas, newlines and quotes in all report text", () => {
  expect(reportCsvCell('Mary, "A"\nSmith')).toBe('"Mary, ""A""\nSmith"');
});
it("escapes spreadsheet formulas while retaining numeric amounts", () => {
  expect(reportCsvCell("=1+1")).toBe('"\'=1+1"');
  expect(reportCsvCell(-10)).toBe('"-10"');
});
