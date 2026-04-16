import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveOwnerId } from "@/lib/queries/properties";

const MAX_MEDIA_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_MEDIA_PER_ISSUE = 5;

type CreateIssueInput = {
  assignmentId: string | null;
  propertyId: string;
  reportedById: string;
  issueType: string;
  severity: string;
  title: string;
  description: string | null;
};

type CreateIssueResult =
  | { success: true; issueId: string }
  | { success: false; error: string };

export async function createIssue(input: CreateIssueInput): Promise<CreateIssueResult> {
  const supabase = await createServerSupabaseClient();

  let ownerId: string;
  try {
    ownerId = await resolveOwnerId();
  } catch {
    return { success: false, error: "Could not resolve owner." };
  }

  const { data, error } = await supabase
    .from("issues")
    .insert({
      owner_id: ownerId,
      assignment_id: input.assignmentId,
      property_id: input.propertyId,
      reported_by_id: input.reportedById,
      issue_type: input.issueType,
      severity: input.severity,
      title: input.title,
      description: input.description,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to create issue." };
  }

  return { success: true, issueId: data.id };
}

type UploadIssueMediaInput = {
  issueId: string;
  assignmentId: string;
  propertyId: string;
  ownerId: string;
  uploadedById: string;
  file: File;
};

type UploadIssueMediaResult =
  | { success: true; mediaId: string }
  | { success: false; error: string };

export async function uploadIssueMedia(
  input: UploadIssueMediaInput,
): Promise<UploadIssueMediaResult> {
  if (input.file.size > MAX_MEDIA_BYTES) {
    return { success: false, error: "File exceeds 5MB limit." };
  }

  const supabase = await createServerSupabaseClient();

  // Check current count
  const { count } = await supabase
    .from("issue_media")
    .select("id", { count: "exact", head: true })
    .eq("issue_id", input.issueId);

  if ((count ?? 0) >= MAX_MEDIA_PER_ISSUE) {
    return { success: false, error: `Maximum ${MAX_MEDIA_PER_ISSUE} photos per issue.` };
  }

  const ext = input.file.name.split(".").pop() ?? "jpg";
  const storagePath = `issues/${input.ownerId}/${input.propertyId}/${input.issueId}/${Date.now()}.${ext}`;

  const { error: storageError } = await supabase.storage
    .from("assignment-photos")
    .upload(storagePath, input.file, { contentType: input.file.type, upsert: false });

  if (storageError) {
    return { success: false, error: storageError.message };
  }

  const { data, error: insertError } = await supabase
    .from("issue_media")
    .insert({
      issue_id: input.issueId,
      storage_path: storagePath,
      file_size_bytes: input.file.size,
      uploaded_by_id: input.uploadedById,
    })
    .select("id")
    .single();

  if (insertError || !data) {
    // Clean up orphaned storage file
    await supabase.storage.from("assignment-photos").remove([storagePath]);
    return { success: false, error: insertError?.message ?? "Failed to record media." };
  }

  return { success: true, mediaId: data.id };
}

type CreateRestockRequestInput = {
  assignmentId: string;
  inventoryItemId: string;
  requestedById: string;
  quantityNeeded: number;
  notes: string | null;
};

type CreateRestockRequestResult =
  | { success: true; requestId: string }
  | { success: false; error: string };

export async function createRestockRequest(
  input: CreateRestockRequestInput,
): Promise<CreateRestockRequestResult> {
  const supabase = await createServerSupabaseClient();

  let ownerId: string;
  try {
    ownerId = await resolveOwnerId();
  } catch {
    return { success: false, error: "Could not resolve owner." };
  }

  const { data, error } = await supabase
    .from("restock_requests")
    .insert({
      owner_id: ownerId,
      assignment_id: input.assignmentId,
      inventory_item_id: input.inventoryItemId,
      requested_by_id: input.requestedById,
      quantity_needed: input.quantityNeeded,
      notes: input.notes,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to create restock request." };
  }

  return { success: true, requestId: data.id };
}

type MarkNeedsRecleanInput = {
  assignmentId: string;
  currentStatus: string;
};

type MarkNeedsRecleanResult =
  | { success: true }
  | { success: false; error: string };

export async function markNeedsReclean(
  input: MarkNeedsRecleanInput,
): Promise<MarkNeedsRecleanResult> {
  // Only valid from completed_pending_review or approved
  const allowed = ["completed_pending_review", "approved", "in_progress"];
  if (!allowed.includes(input.currentStatus)) {
    return {
      success: false,
      error: `Cannot mark needs_reclean from status '${input.currentStatus}'.`,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("assignments")
    .update({ status: "needs_reclean" })
    .eq("id", input.assignmentId)
    .in("status", allowed);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
