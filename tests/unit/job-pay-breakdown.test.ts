import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JobPayBreakdown } from "@/components/shared/job-pay-breakdown";

describe("job pay breakdown", () => {
  it("shows the saved total once and derives cleaning pay from service and reimbursement extras", () => {
    const html = renderToStaticMarkup(createElement(JobPayBreakdown, {
      total: 135.3,
      extras: [
        { id: "1", assignment_id: "job", description: "Laundry", amount: 20.1, kind: "service", created_at: "2026-10-17" },
        { id: "2", assignment_id: "job", description: "Cleaning supplies", amount: 15.2, kind: "reimbursement", created_at: "2026-10-17" },
      ],
    }));
    expect(html).toContain("<details");
    expect(html).toContain("$135.30");
    expect(html).toContain("$100.00");
    expect(html).toContain("Laundry");
    expect(html).toContain("Reimbursement");
    expect(html).not.toContain("$170.60");
  });

  it("keeps jobs without extras simple and does not imply unset pay is zero", () => {
    const simple = renderToStaticMarkup(createElement(JobPayBreakdown, { total: 80 }));
    expect(simple).toContain("$80.00");
    expect(simple).not.toContain("<details");
    const unset = renderToStaticMarkup(createElement(JobPayBreakdown, { total: null }));
    expect(unset).toContain("Pay not set");
    expect(unset).not.toContain("$0.00");
  });
});
