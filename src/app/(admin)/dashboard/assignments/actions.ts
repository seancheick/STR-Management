"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
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
  try {
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
    revalidatePath("/dashboard/schedule");
    revalidatePath("/jobs");
    revalidatePath("/jobs/schedule");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[createAssignmentAction]", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not create assignment.",
    };
  }

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

/**
 * Hard-delete cancelled and approved assignments. Safe because:
 *  - cancelled means the job never happened (soft-deleted already)
 *  - approved means the unit is already guest-ready and the payout is closed
 * Anything in an active state (unassigned/assigned/in_progress/pending_review)
 * is silently skipped. Use this for cleanup, not for mid-flight edits.
 */
export async function deleteAssignmentsAction(
  assignmentIds: string[],
): Promise<{ error: string | null; deleted: number }> {
  await requireRole(["owner", "admin"]);

  if (assignmentIds.length === 0) {
    return { error: "Nothing selected.", deleted: 0 };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("assignments")
    .delete()
    .in("id", assignmentIds)
    .in("status", ["cancelled", "approved"])
    .select("id");

  if (error) return { error: error.message, deleted: 0 };

  revalidatePath("/dashboard/assignments");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/schedule");
  return { error: null, deleted: data?.length ?? 0 };
}

/**
 * Bulk assign a cleaner to a batch of currently-unassigned jobs.
 * Silently skips assignments whose status has already moved away from "unassigned".
 */
export async function bulkAssignCleanerAction(
  assignmentIds: string[],
  cleanerId: string,
): Promise<{ error: string | null; assigned: number }> {
  await requireRole(["owner", "admin"]);

  if (assignmentIds.length === 0) {
    return { error: "Nothing selected.", assigned: 0 };
  }
  if (!cleanerId || typeof cleanerId !== "string") {
    return { error: "Pick a cleaner.", assigned: 0 };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("assignments")
    .update({ cleaner_id: cleanerId, status: "assigned", ack_status: "pending" })
    .in("id", assignmentIds)
    .eq("status", "unassigned")
    .select("id");

  if (error) return { error: error.message, assigned: 0 };

  revalidatePath("/dashboard/assignments");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/jobs");
  revalidatePath("/jobs/schedule");
  return { error: null, assigned: data?.length ?? 0 };
}

