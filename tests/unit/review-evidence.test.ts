import { describe, expect, it } from "vitest";

import { summarizeReviewEvidence } from "@/lib/services/review-evidence";

describe("summarizeReviewEvidence", () => {
  it("shows cleaner notes and unresolved reported issues for admin review", () => {
    const summary = summarizeReviewEvidence({
      notes: [
        { note_type: "cleaner_note", body: "Left spare towels in the closet.", created_at: "2026-04-20T14:00:00Z" },
        { note_type: "internal", body: "Owner-only note", created_at: "2026-04-20T13:00:00Z" },
      ],
      issues: [
        { id: "issue-1", title: "Loose shower handle", severity: "medium", status: "open", created_at: "2026-04-20T14:10:00Z" },
        { id: "issue-2", title: "Resolved bulb", severity: "low", status: "resolved", created_at: "2026-04-20T13:30:00Z" },
      ],
    });

    expect(summary.cleanerNotes).toHaveLength(1);
    expect(summary.cleanerNotes[0]?.body).toBe("Left spare towels in the closet.");
    expect(summary.reportedIssues).toHaveLength(1);
    expect(summary.reportedIssues[0]?.title).toBe("Loose shower handle");
  });
});
