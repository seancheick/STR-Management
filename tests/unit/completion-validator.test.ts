import { describe, expect, it } from "vitest";

import {
  validateAssignmentCompletion,
  type AssignmentCompletionInput,
} from "@/lib/services/completion-validator";

function makeInput(
  overrides: Partial<AssignmentCompletionInput> = {},
): AssignmentCompletionInput {
  return {
    checklistItems: [
      {
        id: "item-1",
        label: "Counters wiped",
        required: true,
        completed: true,
        photoCategory: "kitchen",
      },
      {
        id: "item-2",
        label: "Trash removed",
        required: true,
        completed: true,
        photoCategory: null,
      },
      {
        id: "item-3",
        label: "Balcony sweep",
        required: false,
        completed: false,
        photoCategory: "balcony",
      },
    ],
    photos: [
      {
        id: "photo-1",
        photoCategory: "kitchen",
      },
    ],
    ...overrides,
  };
}

describe("validateAssignmentCompletion", () => {
  it("passes when every required checklist item is complete and required photo categories exist", () => {
    const result = validateAssignmentCompletion(makeInput());

    expect(result.isValid).toBe(true);
    expect(result.missingChecklistItemIds).toEqual([]);
    expect(result.missingPhotoCategories).toEqual([]);
  });

  it("fails when a required checklist item is incomplete", () => {
    const result = validateAssignmentCompletion(
      makeInput({
        checklistItems: [
          {
            id: "item-1",
            label: "Counters wiped",
            required: true,
            completed: false,
            photoCategory: "kitchen",
          },
        ],
      }),
    );

    expect(result.isValid).toBe(false);
    expect(result.missingChecklistItemIds).toEqual(["item-1"]);
    expect(result.missingPhotoCategories).toEqual([]);
  });

  it("fails when a required photo category has no upload", () => {
    const result = validateAssignmentCompletion(
      makeInput({
        photos: [],
      }),
    );

    expect(result.isValid).toBe(false);
    expect(result.missingChecklistItemIds).toEqual([]);
    expect(result.missingPhotoCategories).toEqual(["kitchen"]);
  });

  it("ignores optional checklist items when deciding completion", () => {
    const result = validateAssignmentCompletion(
      makeInput({
        checklistItems: [
          {
            id: "item-1",
            label: "Optional patio photo",
            required: false,
            completed: false,
            photoCategory: "patio",
          },
        ],
        photos: [],
      }),
    );

    expect(result.isValid).toBe(true);
    expect(result.missingChecklistItemIds).toEqual([]);
    expect(result.missingPhotoCategories).toEqual([]);
  });

  it("deduplicates missing photo categories", () => {
    const result = validateAssignmentCompletion(
      makeInput({
        checklistItems: [
          {
            id: "item-1",
            label: "Kitchen overview",
            required: true,
            completed: true,
            photoCategory: "kitchen",
          },
          {
            id: "item-2",
            label: "Kitchen close-up",
            required: true,
            completed: true,
            photoCategory: "kitchen",
          },
        ],
        photos: [],
      }),
    );

    expect(result.isValid).toBe(false);
    expect(result.missingPhotoCategories).toEqual(["kitchen"]);
  });
});
