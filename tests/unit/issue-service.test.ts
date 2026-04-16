import { describe, expect, it } from "vitest";

// ─── markNeedsReclean logic ───────────────────────────────────────────────────
// Test the guard logic in isolation (not the Supabase call).

const ALLOWED_STATUSES = ["completed_pending_review", "approved", "in_progress"];

function canMarkNeedsReclean(currentStatus: string): boolean {
  return ALLOWED_STATUSES.includes(currentStatus);
}

describe("markNeedsReclean guard", () => {
  it("allows transition from completed_pending_review", () => {
    expect(canMarkNeedsReclean("completed_pending_review")).toBe(true);
  });

  it("allows transition from approved", () => {
    expect(canMarkNeedsReclean("approved")).toBe(true);
  });

  it("allows transition from in_progress", () => {
    expect(canMarkNeedsReclean("in_progress")).toBe(true);
  });

  it("rejects transition from unassigned", () => {
    expect(canMarkNeedsReclean("unassigned")).toBe(false);
  });

  it("rejects transition from assigned", () => {
    expect(canMarkNeedsReclean("assigned")).toBe(false);
  });

  it("rejects transition from confirmed", () => {
    expect(canMarkNeedsReclean("confirmed")).toBe(false);
  });

  it("rejects transition from cancelled", () => {
    expect(canMarkNeedsReclean("cancelled")).toBe(false);
  });

  it("rejects transition from needs_reclean (already set)", () => {
    expect(canMarkNeedsReclean("needs_reclean")).toBe(false);
  });
});

// ─── Issue severity ordering ──────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function isCritical(severity: string): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER["high"];
}

describe("issue severity classification", () => {
  it("classifies low severity as non-critical", () => {
    expect(isCritical("low")).toBe(false);
  });

  it("classifies medium severity as non-critical", () => {
    expect(isCritical("medium")).toBe(false);
  });

  it("classifies high severity as critical", () => {
    expect(isCritical("high")).toBe(true);
  });

  it("classifies critical severity as critical", () => {
    expect(isCritical("critical")).toBe(true);
  });
});

// ─── Inventory low-stock detection ───────────────────────────────────────────

type InventoryItem = {
  id: string;
  current_quantity: number;
  reorder_threshold: number;
};

function isLowStock(item: InventoryItem): boolean {
  return item.current_quantity <= item.reorder_threshold;
}

describe("inventory low-stock detection", () => {
  it("flags item at exactly the threshold as low stock", () => {
    expect(isLowStock({ id: "a", current_quantity: 2, reorder_threshold: 2 })).toBe(true);
  });

  it("flags item below the threshold as low stock", () => {
    expect(isLowStock({ id: "a", current_quantity: 0, reorder_threshold: 2 })).toBe(true);
  });

  it("does not flag item above the threshold", () => {
    expect(isLowStock({ id: "a", current_quantity: 5, reorder_threshold: 2 })).toBe(false);
  });

  it("handles zero threshold (always in stock if qty > 0)", () => {
    expect(isLowStock({ id: "a", current_quantity: 1, reorder_threshold: 0 })).toBe(false);
  });

  it("handles zero threshold with zero quantity", () => {
    expect(isLowStock({ id: "a", current_quantity: 0, reorder_threshold: 0 })).toBe(true);
  });
});

// ─── Issue type classification ────────────────────────────────────────────────

const MAINTENANCE_TYPES = ["maintenance", "damage", "access"];

function isMaintenanceIssue(issueType: string): boolean {
  return MAINTENANCE_TYPES.includes(issueType);
}

function isCleaningIssue(issueType: string): boolean {
  return issueType === "cleaning";
}

describe("issue type classification", () => {
  it("identifies maintenance issues", () => {
    expect(isMaintenanceIssue("maintenance")).toBe(true);
    expect(isMaintenanceIssue("damage")).toBe(true);
    expect(isMaintenanceIssue("access")).toBe(true);
  });

  it("does not classify cleaning as maintenance", () => {
    expect(isMaintenanceIssue("cleaning")).toBe(false);
  });

  it("does not classify inventory as maintenance", () => {
    expect(isMaintenanceIssue("inventory")).toBe(false);
  });

  it("identifies cleaning issues", () => {
    expect(isCleaningIssue("cleaning")).toBe(true);
    expect(isCleaningIssue("maintenance")).toBe(false);
  });
});

// ─── Restock quantity validation ──────────────────────────────────────────────

function validateRestockQuantity(qty: number): string | null {
  if (!Number.isInteger(qty)) return "Quantity must be a whole number.";
  if (qty <= 0) return "Quantity must be at least 1.";
  return null;
}

describe("restock quantity validation", () => {
  it("accepts valid positive integer", () => {
    expect(validateRestockQuantity(3)).toBeNull();
  });

  it("rejects zero", () => {
    expect(validateRestockQuantity(0)).not.toBeNull();
  });

  it("rejects negative", () => {
    expect(validateRestockQuantity(-1)).not.toBeNull();
  });

  it("rejects fractional quantity", () => {
    expect(validateRestockQuantity(1.5)).not.toBeNull();
  });
});
