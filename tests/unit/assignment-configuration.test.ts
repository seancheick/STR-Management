import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listing: { id: "three-bed", physical_unit_id: "physical-floor", primary_checklist_template_id: "three-bed-checklist", default_clean_price: 120 } as Record<string, unknown> | null,
  insert: vi.fn(), eq: vi.fn(), checklist: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/checklist", () => ({ getChecklistTemplateItems: mocks.checklist }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => { mocks.eq(...args); return query; },
        maybeSingle: async () => ({ data: mocks.listing, error: null }),
        insert: (row: unknown) => { mocks.insert(table, row); return query; },
        single: async () => ({ data: { id: "new-job" }, error: null }),
      };
      return query;
    },
  }),
}));
import { createAssignment, type CreateAssignmentInput } from "@/lib/services/assignment-service";

const recurringInput: CreateAssignmentInput = {
  ownerId: "owner", propertyId: "three-bed", cleanerId: "cleaner",
  dueAt: "2026-10-20T19:00:00Z", checkoutAt: null, priority: "normal",
  expectedDurationMin: null, fixedPayoutAmount: null,
  primaryChecklistTemplateId: null, createdByUserId: "owner",
};

describe("assignment listing configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listing = { id: "three-bed", physical_unit_id: "physical-floor", primary_checklist_template_id: "three-bed-checklist", default_clean_price: 120 };
    mocks.checklist.mockResolvedValue([]);
  });
  it("canonicalizes recurring assignments while keeping the selected listing rate/checklist", async () => {
    expect(await createAssignment(recurringInput)).toEqual({ success: true, assignmentId: "new-job" });
    expect(mocks.insert).toHaveBeenCalledWith("assignments", expect.objectContaining({ property_id: "physical-floor", listing_property_id: "three-bed", fixed_payout_amount: 120 }));
    expect(mocks.checklist).toHaveBeenCalledWith("three-bed-checklist");
    expect(mocks.eq).toHaveBeenCalledWith("owner_id", "owner");
  });
  it("ignores a caller-supplied operational ID but preserves explicit payout/checklist overrides", async () => {
    await createAssignment({ ...recurringInput, propertyId: "wrong-floor", listingPropertyId: "three-bed", fixedPayoutAmount: 150, primaryChecklistTemplateId: "custom-checklist" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "three-bed");
    expect(mocks.insert).toHaveBeenCalledWith("assignments", expect.objectContaining({ property_id: "physical-floor", listing_property_id: "three-bed", fixed_payout_amount: 150 }));
    expect(mocks.checklist).toHaveBeenCalledWith("custom-checklist");
  });
  it("creates nothing when the listing is absent from the owner's scope", async () => {
    mocks.listing = null;
    expect(await createAssignment(recurringInput)).toEqual({ success: false, error: "Property not found." });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
