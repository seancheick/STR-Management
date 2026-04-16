export type AssignmentCompletionChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
  photoCategory: string | null;
};

export type AssignmentCompletionPhoto = {
  id: string;
  photoCategory: string;
};

export type AssignmentCompletionInput = {
  checklistItems: AssignmentCompletionChecklistItem[];
  photos: AssignmentCompletionPhoto[];
};

export type AssignmentCompletionValidationResult = {
  isValid: boolean;
  missingChecklistItemIds: string[];
  missingPhotoCategories: string[];
};

export function validateAssignmentCompletion(
  input: AssignmentCompletionInput,
): AssignmentCompletionValidationResult {
  const requiredChecklistItems = input.checklistItems.filter((item) => item.required);

  const missingChecklistItemIds = requiredChecklistItems
    .filter((item) => !item.completed)
    .map((item) => item.id);

  const uploadedCategories = new Set(input.photos.map((photo) => photo.photoCategory));
  const missingPhotoCategories = Array.from(
    new Set(
      requiredChecklistItems
        .map((item) => item.photoCategory)
        .filter((category): category is string => category !== null)
        .filter((category): category is string => !uploadedCategories.has(category)),
    ),
  );

  return {
    isValid:
      missingChecklistItemIds.length === 0 && missingPhotoCategories.length === 0,
    missingChecklistItemIds,
    missingPhotoCategories,
  };
}
