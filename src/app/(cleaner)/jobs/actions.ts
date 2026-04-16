"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateAssignmentCompletion } from "@/lib/services/completion-validator";
import { createIssue, uploadIssueMedia, createRestockRequest } from "@/lib/services/issue-service";

export type CleanerActionResult = { success: boolean; error?: string };

/**
 * Accept a job. Uses optimistic lock: only succeeds when the row is still
 * status='assigned' AND ack_status='pending' — prevents double-accept.
 */
export async function acceptJobAction(
  assignmentId: string,
): Promise<CleanerActionResult> {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("assignments")
    .update({
      ack_status: "accepted",
      status: "confirmed",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .eq("cleaner_id", profile.id)
    .eq("status", "assigned")
    .eq("ack_status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: false, error: "Job is no longer available to accept." };
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${assignmentId}`);
  return { success: true };
}

export async function startJobAction(
  assignmentId: string,
): Promise<CleanerActionResult> {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("assignments")
    .update({
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .eq("cleaner_id", profile.id)
    .eq("status", "confirmed")
    .eq("ack_status", "accepted")
    .select("id")
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: false, error: "Job cannot be started in its current state." };
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${assignmentId}`);
  return { success: true };
}

export async function toggleChecklistItemAction(
  itemId: string,
  assignmentId: string,
  completed: boolean,
): Promise<CleanerActionResult> {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("assignment_checklist_items")
    .update({
      completed,
      completed_by_id: completed ? profile.id : null,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", itemId)
    .eq("assignment_id", assignmentId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/jobs/${assignmentId}`);
  return { success: true };
}

export async function completeJobAction(
  assignmentId: string,
): Promise<CleanerActionResult> {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  // Fetch current checklist + photos for server-side proof validation
  const [checklistRes, photosRes] = await Promise.all([
    supabase
      .from("assignment_checklist_items")
      .select("id, label, required, completed, photo_category")
      .eq("assignment_id", assignmentId),
    supabase
      .from("assignment_photos")
      .select("id, photo_category")
      .eq("assignment_id", assignmentId),
  ]);

  const checklistItems = (checklistRes.data ?? []).map((item) => ({
    id: item.id as string,
    label: item.label as string,
    required: item.required as boolean,
    completed: item.completed as boolean,
    photoCategory: item.photo_category as string | null,
  }));

  const photos = (photosRes.data ?? []).map((p) => ({
    id: p.id as string,
    photoCategory: p.photo_category as string,
  }));

  const validation = validateAssignmentCompletion({ checklistItems, photos });

  if (!validation.isValid) {
    const parts: string[] = [];
    if (validation.missingChecklistItemIds.length > 0) {
      parts.push(
        `${validation.missingChecklistItemIds.length} required checklist item(s) incomplete`,
      );
    }
    if (validation.missingPhotoCategories.length > 0) {
      parts.push(
        `missing photos: ${validation.missingPhotoCategories.join(", ")}`,
      );
    }
    return { success: false, error: `Cannot complete: ${parts.join("; ")}.` };
  }

  const { data, error } = await supabase
    .from("assignments")
    .update({
      status: "completed_pending_review",
      completed_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .eq("cleaner_id", profile.id)
    .eq("status", "in_progress")
    .eq("ack_status", "accepted")
    .select("id")
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: false, error: "Job cannot be completed in its current state." };
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${assignmentId}`);
  return { success: true };
}

// ─── Issue Reporting ─────────────────────────────────────────────────────────

const reportIssueSchema = z.object({
  assignmentId: z.string().uuid(),
  propertyId: z.string().uuid(),
  issueType: z.enum(["cleaning", "maintenance", "damage", "inventory", "access", "other"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  title: z.string().min(3, "Title must be at least 3 characters.").max(120),
  description: z.string().max(2000).nullable(),
});

export type ReportIssueState = {
  status: "idle" | "success" | "error";
  message: string | null;
  issueId?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function reportIssueAction(
  _prev: ReportIssueState,
  formData: FormData,
): Promise<ReportIssueState> {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);

  let values: z.infer<typeof reportIssueSchema>;
  try {
    values = reportIssueSchema.parse({
      assignmentId: formData.get("assignmentId"),
      propertyId: formData.get("propertyId"),
      issueType: formData.get("issueType"),
      severity: formData.get("severity"),
      title: formData.get("title"),
      description: formData.get("description") || null,
    });
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

  const result = await createIssue({
    assignmentId: values.assignmentId,
    propertyId: values.propertyId,
    reportedById: profile.id,
    issueType: values.issueType,
    severity: values.severity,
    title: values.title,
    description: values.description,
  });

  if (!result.success) {
    return { status: "error", message: result.error };
  }

  revalidatePath(`/jobs/${values.assignmentId}`);
  return { status: "success", message: "Issue reported.", issueId: result.issueId };
}

export async function uploadIssueMediaAction(
  issueId: string,
  assignmentId: string,
  propertyId: string,
  formData: FormData,
): Promise<CleanerActionResult> {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const file = formData.get("media") as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: "No file provided." };
  }

  const { data: assignment } = await supabase
    .from("assignments")
    .select("owner_id")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment) {
    return { success: false, error: "Assignment not found." };
  }

  const result = await uploadIssueMedia({
    issueId,
    assignmentId,
    propertyId,
    ownerId: assignment.owner_id as string,
    uploadedById: profile.id,
    file,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  revalidatePath(`/jobs/${assignmentId}`);
  return { success: true };
}

// ─── Restock Request ─────────────────────────────────────────────────────────

const restockSchema = z.object({
  assignmentId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  quantityNeeded: z.number().int().positive(),
  notes: z.string().max(500).nullable(),
});

export type RestockState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function requestRestockAction(
  _prev: RestockState,
  formData: FormData,
): Promise<RestockState> {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);

  let values: z.infer<typeof restockSchema>;
  try {
    values = restockSchema.parse({
      assignmentId: formData.get("assignmentId"),
      inventoryItemId: formData.get("inventoryItemId"),
      quantityNeeded: Number(formData.get("quantityNeeded") ?? 1),
      notes: formData.get("notes") || null,
    });
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

  const result = await createRestockRequest({
    assignmentId: values.assignmentId,
    inventoryItemId: values.inventoryItemId,
    requestedById: profile.id,
    quantityNeeded: values.quantityNeeded,
    notes: values.notes,
  });

  if (!result.success) {
    return { status: "error", message: result.error };
  }

  return { status: "success", message: "Restock request submitted." };
}

export async function uploadPhotoAction(
  assignmentId: string,
  formData: FormData,
): Promise<CleanerActionResult> {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const file = formData.get("photo") as File | null;
  const photoCategory = formData.get("photoCategory") as string | null;

  if (!file || file.size === 0) {
    return { success: false, error: "No file provided." };
  }

  if (!photoCategory) {
    return { success: false, error: "Photo category is required." };
  }

  // Validate file size (5MB max)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return { success: false, error: "File is too large. Maximum size is 5MB." };
  }

  // Validate photo count (max 10)
  const { count } = await supabase
    .from("assignment_photos")
    .select("id", { count: "exact", head: true })
    .eq("assignment_id", assignmentId);

  if ((count ?? 0) >= 10) {
    return { success: false, error: "Maximum 10 photos per assignment." };
  }

  // Get assignment to build storage path
  const { data: assignment } = await supabase
    .from("assignments")
    .select("owner_id, property_id")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment) {
    return { success: false, error: "Assignment not found." };
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const storagePath = `${assignment.owner_id}/${assignment.property_id}/${assignmentId}/${Date.now()}-${photoCategory}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("assignment-photos")
    .upload(storagePath, file, { upsert: false });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { error: insertError } = await supabase
    .from("assignment_photos")
    .insert({
      assignment_id: assignmentId,
      photo_category: photoCategory,
      storage_path: storagePath,
      captured_by_id: profile.id,
      captured_at: new Date().toISOString(),
    });

  if (insertError) {
    // Clean up orphaned storage file
    await supabase.storage.from("assignment-photos").remove([storagePath]);
    return { success: false, error: insertError.message };
  }

  revalidatePath(`/jobs/${assignmentId}`);
  return { success: true };
}
