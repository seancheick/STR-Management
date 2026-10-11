import { describe, expect, it } from "vitest";
import { csvDownloadDisposition } from "@/lib/services/csv-download";
describe("CSV download headers", () => {
  it("supports a Unicode report title without a ByteString error", () => {
    const value = csvDownloadDisposition("Mary — Jan–May 2026 (paid)");
    expect(() => new Headers({ "Content-Disposition": value })).not.toThrow();
    expect(value).toContain("%E2%80%94");
  });
  it("keeps quotes and newlines from becoming header syntax", () => {
    const value = csvDownloadDisposition('Mary"\r\nReport');
    expect(() => new Headers({ "Content-Disposition": value })).not.toThrow();
    expect(value).not.toContain("\r");
    expect(value).toContain("%22");
  });
});
