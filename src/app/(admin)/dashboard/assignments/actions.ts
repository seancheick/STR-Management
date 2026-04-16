"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { resolveOwnerId } from "@/lib/queries/properties";
import { createAssignment } from "@/lib/services/assignment-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const createAssignmentSchema = z.object({
  propertyId: z.string().uuid("Select a property."),
  cleanerId: z.string().uuid().nullable(),
  dueAt: z.string().min(1, "Due date is required."),
  checkoutAt: z.string().nullable(),
  nextCheckinAt: z.string().nullable(),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  expectedDurationMin: z.number().int().positive().nullable(),
  fixedPayoutAmount: z.number().positive().nullable(),
});

export type AssignmentActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
};

function parseAssignmentForm(formData: FormData) {
  const raw = {
    propertyId: formData.get("propertyId"),
    cleanerId: formData.get("cleanerId") || null,
    dueAt: formData.get("dueAt"),
    checkoutAt: formData.get("checkoutAt") || null,
    nextCheckinAt: formData.get("nextCheckinAt") || null,
    priority: formData.get("priority") ?? "normal",
    expectedDurationMin: formData.get("expectedDurationMin")
      ? Number(formData.get("expectedDurationMin"))
      : null,
    fixedPayoutAmount: formData.get("fixedPayoutAmount")
      ? Number(formData.get("fixedPayoutAmount"))
      : null,
  };

  return createAssignmentSchema.parse(raw);
}

export async function createAssignmentAction(
  _prev: AssignmentActionState,
  formData: FormData,
): Promise<AssignmentActionState> {
  const profile = await requireRole(["owner", "admin"]);

  let values: ReturnType<typeof parseAssignmentForm>;
  try {
    values = parseAssignmentForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        message: "Validation failed.",
        fieldErrors: error.flatten().fieldErrors as Record<string, string[] | undefined>,
      };
    }
    return { status: "error", message: "Invalid form data." };
  }

  const supabase = await createServerSupabaseClient();

  // Explicit template selection overrides the property default
  const explicitTemplateId = (formData.get("templateId") as string | null) || null;
  let resolvedTemplateId = explicitTemplateId;

  if (!resolvedTemplateId) {
    const { data: property } = await supabase
      .from("properties")
      .select("primary_checklist_template_id")
      .eq("id", values.propertyId)
      .maybeSingle();
    resolvedTemplateId = property?.primary_checklist_template_id ?? null;
  }

  const ownerId = await resolveOwnerId();

  const result = await createAssignment({
    ownerId,
    propertyId: values.propertyId,
    cleanerId: values.cleanerId,
    dueAt: values.dueAt,
    checkoutAt: values.checkoutAt,
    nextCheckinAt: values.nextCheckinAt,
    priority: values.priority,
    expectedDurationMin: values.expectedDurationMin,
    fixedPayoutAmount: values.fixedPayoutAmount,
    primaryChecklistTemplateId: resolvedTemplateId,
    createdByUserId: profile.id,
  });

  if (!result.success) {
    return { status: "error", message: result.error };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assignments");
  redirect(`/dashboard/assignments?status=created` as never);
}

export async function assignCleanerAction(
  assignmentId: string,
  cleanerId: string,
): Promise<{ error: string | null }> {
  await requireRole(["owner", "admin"]);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("assignments")
    .update({ cleaner_id: cleanerId, status: "assigned", ack_status: "pending" })
    .eq("id", assignmentId)
    .eq("status", "unassigned");

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/assignments");
  revalidatePath("/dashboard");
  return { error: null };
}

