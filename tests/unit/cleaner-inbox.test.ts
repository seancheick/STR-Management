import { describe, expect, it } from "vitest";
import { currentCleanerNotifications } from "../../src/lib/services/cleaner-inbox";

describe("cleaner inbox", () => {
  const row = (
    type: string,
    status: string,
    seen_at: string | null = null,
  ) => ({
    assignment_id: "job",
    notification_type: type,
    seen_at,
    assignment: { status },
  });
  it("removes stale offers but retains unseen cancellations and payment updates", () => {
    const cancellation = row("assignment_cancelled", "cancelled");
    const payment = row("payment_received", "approved");
    expect(
      currentCleanerNotifications([
        row("new_assignment", "approved"),
        cancellation,
        payment,
      ]),
    ).toEqual([cancellation, payment]);
  });
  it("collapses channel copies and clears previously seen cancellation notices", () => {
    const offer = row("new_assignment", "assigned");
    expect(
      currentCleanerNotifications([
        offer,
        offer,
        row("assignment_cancelled", "cancelled", "2026-10-11"),
      ]),
    ).toEqual([offer]);
  });
  it("hides offers when a cleaner was removed or no longer has access to the job", () => {
    const revoked = { ...row("new_assignment", "assigned"), assignment: null };
    const cancellation = { ...row("assignment_cancelled", "cancelled"), assignment: null };
    expect(currentCleanerNotifications([row("new_assignment", "unassigned"), revoked, cancellation])).toEqual([cancellation]);
  });

});
