import { describe, expect, it } from "vitest";

// ─── Template form validation ─────────────────────────────────────────────────

function validateTemplateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Template name is required.";
  if (trimmed.length > 120) return "Template name must be 120 characters or fewer.";
  return null;
}

describe("template name validation", () => {
  it("accepts a valid name", () => {
    expect(validateTemplateName("2BR Standard Turnover")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(validateTemplateName("")).not.toBeNull();
  });

  it("rejects whitespace-only", () => {
    expect(validateTemplateName("   ")).not.toBeNull();
  });

  it("rejects name over 120 chars", () => {
    expect(validateTemplateName("a".repeat(121))).not.toBeNull();
  });

  it("accepts name exactly 120 chars", () => {
    expect(validateTemplateName("a".repeat(120))).toBeNull();
  });
});

// ─── Template item validation ─────────────────────────────────────────────────

function validateTemplateItem(label: string, sortOrder: unknown): string | null {
  if (!label.trim()) return "Item label is required.";
  const order = Number(sortOrder);
  if (!Number.isInteger(order) || order < 0) return "Sort order must be a non-negative integer.";
  return null;
}

describe("template item validation", () => {
  it("accepts valid label and sort order", () => {
    expect(validateTemplateItem("Wipe counters", 0)).toBeNull();
  });

  it("rejects empty label", () => {
    expect(validateTemplateItem("", 0)).not.toBeNull();
  });

  it("rejects negative sort order", () => {
    expect(validateTemplateItem("Clean sink", -1)).not.toBeNull();
  });

  it("rejects non-integer sort order", () => {
    expect(validateTemplateItem("Clean sink", 1.5)).not.toBeNull();
  });

  it("accepts sort order of 0", () => {
    expect(validateTemplateItem("Clean sink", 0)).toBeNull();
  });
});

// ─── Supervisor review state guards ──────────────────────────────────────────

type AssignmentStatus =
  | "unassigned" | "assigned" | "confirmed" | "in_progress"
  | "completed_pending_review" | "approved" | "needs_reclean" | "cancelled";

function canApproveJob(status: AssignmentStatus): boolean {
  return status === "completed_pending_review";
}

function canMarkNeedsRecleanFromReview(status: AssignmentStatus): boolean {
  return status === "completed_pending_review";
}

describe("supervisor review guards", () => {
  it("only completed_pending_review can be approved", () => {
    expect(canApproveJob("completed_pending_review")).toBe(true);
    expect(canApproveJob("in_progress")).toBe(false);
    expect(canApproveJob("approved")).toBe(false);
    expect(canApproveJob("assigned")).toBe(false);
  });

  it("only completed_pending_review can be sent for reclean", () => {
    expect(canMarkNeedsRecleanFromReview("completed_pending_review")).toBe(true);
    expect(canMarkNeedsRecleanFromReview("approved")).toBe(false);
    expect(canMarkNeedsRecleanFromReview("in_progress")).toBe(false);
  });
});

// ─── Issue in_progress transition guard ──────────────────────────────────────

type IssueStatus = "open" | "acknowledged" | "in_progress" | "resolved" | "closed";

function canMarkInProgress(status: IssueStatus): boolean {
  return status === "acknowledged";
}

function canResolveIssue(status: IssueStatus): boolean {
  return ["open", "acknowledged", "in_progress"].includes(status);
}

describe("issue status guards", () => {
  it("only acknowledged issues can be started", () => {
    expect(canMarkInProgress("acknowledged")).toBe(true);
    expect(canMarkInProgress("open")).toBe(false);
    expect(canMarkInProgress("in_progress")).toBe(false);
    expect(canMarkInProgress("resolved")).toBe(false);
  });

  it("open/acknowledged/in_progress can be resolved", () => {
    expect(canResolveIssue("open")).toBe(true);
    expect(canResolveIssue("acknowledged")).toBe(true);
    expect(canResolveIssue("in_progress")).toBe(true);
    expect(canResolveIssue("resolved")).toBe(false);
    expect(canResolveIssue("closed")).toBe(false);
  });
});

// ─── Checklist snapshot — visual reference fields ─────────────────────────────

type TemplateItem = {
  id: string;
  label: string;
  instruction_text: string | null;
  reference_media_url: string | null;
  required: boolean;
  sort_order: number;
  section_name: string | null;
  photo_category: string | null;
};

type SnapshotRow = {
  assignment_id: string;
  template_item_id: string;
  label: string;
  instruction_text: string | null;
  reference_media_url: string | null;
  required: boolean;
  sort_order: number;
  section_name: string | null;
  photo_category: string | null;
  completed: boolean;
};

function snapshotItems(assignmentId: string, items: TemplateItem[]): SnapshotRow[] {
  return items.map((item) => ({
    assignment_id: assignmentId,
    template_item_id: item.id,
    label: item.label,
    instruction_text: item.instruction_text ?? null,
    reference_media_url: item.reference_media_url ?? null,
    required: item.required,
    sort_order: item.sort_order,
    section_name: item.section_name,
    photo_category: item.photo_category,
    completed: false,
  }));
}

describe("checklist snapshot — visual reference fields", () => {
  it("copies instruction_text into snapshot row", () => {
    const items: TemplateItem[] = [
      {
        id: "i1",
        label: "Wipe stovetop",
        instruction_text: "Use the green cloth, not the sponge.",
        reference_media_url: null,
        required: true,
        sort_order: 0,
        section_name: "Kitchen",
        photo_category: null,
      },
    ];
    const rows = snapshotItems("a1", items);
    expect(rows[0].instruction_text).toBe("Use the green cloth, not the sponge.");
  });

  it("copies reference_media_url into snapshot row", () => {
    const items: TemplateItem[] = [
      {
        id: "i2",
        label: "Make bed",
        instruction_text: null,
        reference_media_url: "https://example.com/bed-photo.jpg",
        required: true,
        sort_order: 1,
        section_name: "Bedroom",
        photo_category: null,
      },
    ];
    const rows = snapshotItems("a1", items);
    expect(rows[0].reference_media_url).toBe("https://example.com/bed-photo.jpg");
  });

  it("sets completed = false on all snapshot rows", () => {
    const items: TemplateItem[] = [
      { id: "i3", label: "Vacuum", instruction_text: null, reference_media_url: null, required: false, sort_order: 0, section_name: null, photo_category: null },
      { id: "i4", label: "Mop", instruction_text: null, reference_media_url: null, required: true, sort_order: 1, section_name: null, photo_category: null },
    ];
    const rows = snapshotItems("a2", items);
    expect(rows.every((r) => r.completed === false)).toBe(true);
  });

  it("returns empty array for empty template", () => {
    expect(snapshotItems("a3", [])).toEqual([]);
  });
});
