import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RightNowHero } from "@/components/dashboard/right-now-hero";
import { cleaningDoneFilter, isCleaningOutstanding } from "@/lib/domain/assignments";

const property = { name: "Longmont Basement · 1 bedroom", timezone: "America/New_York" };
const sameDay = (status: string) => ({
  id: `job-${status}`, status, ack_status: "accepted", cleaner_id: "mary",
  checkout_at: "2026-10-21T15:00:00Z", due_at: "2026-10-21T19:00:00Z", next_checkin_at: "2026-10-21T19:00:00Z",
  cleaners: { full_name: "Mary" }, properties: property,
});
const render = (todaysJobs: ReturnType<typeof sameDay>[], pendingReviewCount = 0) =>
  renderToStaticMarkup(createElement(RightNowHero, {
    todaysJobs, atRiskJobs: [], weekAssignments: [], pendingReviewCount, unassignedCount: 0,
  } as unknown as Parameters<typeof RightNowHero>[0]));

describe("Right now hero", () => {
  it("flags a same-day turnover that still needs cleaning", () => {
    expect(render([sameDay("confirmed")])).toContain("Same-day check-in: Longmont Basement");
  });

  it("drops the same-day alert once the cleaning is done, approved or cancelled", () => {
    for (const status of ["approved", "cancelled", "completed_pending_review"]) {
      expect(render([sameDay(status)])).not.toContain("Same-day check-in");
    }
  });

  it("moves on to the review queue when the finished job awaits approval", () => {
    expect(render([sameDay("completed_pending_review")], 1)).toContain("1 job awaiting your approval");
  });
});

describe("cleaning status helpers", () => {
  it("keep the UI and query definitions of finished work identical", () => {
    expect(cleaningDoneFilter).toBe('("completed_pending_review","approved","cancelled")');
    expect(["unassigned", "assigned", "confirmed", "in_progress", "needs_reclean"].every(isCleaningOutstanding)).toBe(true);
    expect(["approved", "cancelled", "completed_pending_review"].some(isCleaningOutstanding)).toBe(false);
  });
});
