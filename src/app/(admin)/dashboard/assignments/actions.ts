"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { z } from "zod";

import { sendAssignmentBatchNotification } from "@/lib/notifications/notification-service";
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

    const mode=String(formData.get("assignmentMode")??"request");
    const completionReason=String(formData.get("completionReason")??"").trim();
    if(!["request","direct","complete"].includes(mode))return {status:"error",message:"Choose a cleaning action."};
    if(mode==="complete" && (!values.cleanerId || formData.get("completionConfirmed")!=="on" || completionReason.length<3 || completionReason.length>1000 || Date.parse(values.checkoutAt??values.dueAt)>Date.now()))return {status:"error",message:"Choose a cleaner, a past checkout or service date, and confirm the completed work."};
    const supabase = await createServerSupabaseClient();

    const ownerId = await resolveOwnerId();
    const { data: selectedProperty, error: propertyError } = await supabase
      .from("properties")
      .select("id, physical_unit_id, primary_checklist_template_id, default_clean_price")
      .eq("id", values.propertyId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (propertyError || !selectedProperty) {
      return { status: "error", message: propertyError?.message ?? "Property not found." };
    }

    // Listing-specific checklist/rate stays with the selected configuration;
    // operational turnover identity belongs to its shared physical unit.
    const explicitTemplateId = (formData.get("templateId") as string | null) || null;
    const resolvedTemplateId = explicitTemplateId ?? selectedProperty.primary_checklist_template_id;

    const result = await createAssignment({
      ownerId,
      propertyId: selectedProperty.physical_unit_id ?? selectedProperty.id,
      listingPropertyId: selectedProperty.id,
      cleanerId: null,
      dueAt: values.dueAt,
      checkoutAt: values.checkoutAt,
      priority: values.priority,
      expectedDurationMin: values.expectedDurationMin,
      fixedPayoutAmount: values.fixedPayoutAmount ?? selectedProperty.default_clean_price,
      primaryChecklistTemplateId: resolvedTemplateId,
      createdByUserId: profile.id,
    });

    if (!result.success) {
      return { status: "error", message: result.error };
    }

    if (values.cleanerId) {
      if(mode==="complete") {
        const {error}=await supabase.rpc("owner_manage_cleaning",{target_id:result.assignmentId,operation:"complete",target_cleaner:values.cleanerId,audit_reason:completionReason,confirmed:true});
        if(error)return {status:"error",message:`Cleaning created as unassigned. ${error.message}`};
        await sendAssignmentBatchNotification(ownerId,values.cleanerId,[result.assignmentId],"complete").catch(error=>console.error("[completion-notification]",error));
      } else {
        const assigned=await bulkAssignCleanerAction([result.assignmentId],values.cleanerId,mode as "direct"|"request");
        if(assigned.error||!assigned.assigned)return {status:"error",message:`Cleaning created as unassigned. ${assigned.error??"Assign a cleaner from the schedule."}`};
      }
    }

    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/payouts");
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
  const result = await bulkAssignCleanerAction([assignmentId], cleanerId);
  return { error: result.error ?? (result.assigned === 0 ? "This job is already assigned or no longer available. Refresh and review it." : null) };
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
  assignmentMode: "request" | "direct" = "request",
): Promise<{ error: string | null; assigned: number }> {
  await requireRole(["owner", "admin"]);

  const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000), cleanerId: z.string().uuid() }).safeParse({ ids: assignmentIds, cleanerId });
  if (!parsed.success) return { error: "Select valid cleanings and a cleaner (up to 1,000 jobs).", assigned: 0 };
  const ownerId = await resolveOwnerId();
  const supabase = await createServerSupabaseClient();
  const { data: cleaner, error: cleanerError } = await supabase.from("users").select("id")
    .eq("id", parsed.data.cleanerId).eq("owner_id", ownerId).eq("role", "cleaner").eq("active", true).maybeSingle();
  if (cleanerError || !cleaner) return { error: "Choose an active cleaner from your team.", assigned: 0 };
  const { data, error } = await supabase.rpc("assign_cleaning_batch_mode", {
    job_ids: [...new Set(parsed.data.ids)], target_cleaner: cleanerId, assignment_mode: assignmentMode,
  });

  if (error) return { error: error.message, assigned: 0 };

  if (data?.length) await sendAssignmentBatchNotification(ownerId, cleanerId, (data as { id: string }[]).map((job) => job.id), assignmentMode);
  revalidatePath("/dashboard/assignments");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/jobs");
  revalidatePath("/jobs/inbox");
  revalidatePath("/jobs/schedule");
  return { error: null, assigned: data?.length ?? 0 };
}


export async function recordCompletedCleaningsAction(ids:string[],cleanerId:string,reason:string,confirmed:boolean):Promise<{error:string|null;completed:number}> {
 const actor=await requireRole(["owner","admin"]);
 const parsed=z.object({ids:z.array(z.string().uuid()).min(1).max(1000),cleaner:z.string().uuid(),reason:z.string().trim().min(3).max(1000),confirmed:z.literal(true)}).safeParse({ids,cleaner:cleanerId,reason,confirmed});
 if(!parsed.success)return {error:"Choose jobs, a cleaner, and confirm the completed work.",completed:0};
 const supabase=await createServerSupabaseClient();
 const {data,error}=await supabase.rpc("complete_cleaning_batch",{job_ids:[...new Set(ids)],target_cleaner:cleanerId,audit_reason:parsed.data.reason,confirmed:true});
 if(error)return {error:error.message,completed:0};
 await sendAssignmentBatchNotification(actor.owner_id,cleanerId,ids,"complete").catch(error=>console.error("[completion-notification]",error));
 revalidatePath("/dashboard","layout");revalidatePath("/jobs","layout");
 return {error:null,completed:Number(data??0)};
}
