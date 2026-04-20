import { z } from "zod";

function optionalTrimmedString(maxLength: number) {
  return z.preprocess((value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().max(maxLength).nullable());
}

export const cleanerProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required.").max(120),
  phone: optionalTrimmedString(40),
  availability: optionalTrimmedString(500),
});

export type CleanerProfileValues = z.infer<typeof cleanerProfileSchema>;

export type CleanerProfileParseResult =
  | { success: true; data: CleanerProfileValues }
  | {
      success: false;
      fieldErrors: Partial<Record<keyof CleanerProfileValues, string[]>>;
    };

export function parseCleanerProfileFormData(
  formData: FormData,
): CleanerProfileParseResult {
  const result = cleanerProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    availability: formData.get("availability"),
  });

  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  return { success: true, data: result.data };
}
