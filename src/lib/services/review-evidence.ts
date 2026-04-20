export type ReviewEvidenceNote = {
  note_type: string;
  body: string;
  created_at: string;
  users?: { full_name: string } | null;
};

export type ReviewEvidenceIssue = {
  id: string;
  title: string;
  severity: string;
  status: string;
  description?: string | null;
  created_at: string;
};

const CLOSED_ISSUE_STATUSES = new Set(["resolved", "closed"]);

export function summarizeReviewEvidence({
  notes,
  issues,
}: {
  notes: ReviewEvidenceNote[];
  issues: ReviewEvidenceIssue[];
}) {
  return {
    cleanerNotes: notes
      .filter((note) => note.note_type === "cleaner_note" && note.body.trim().length > 0)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    reportedIssues: issues
      .filter((issue) => !CLOSED_ISSUE_STATUSES.has(issue.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}
