"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { approveJob } from "@/lib/services/template-service";
import { markNeedsReclean } from "@/lib/services/issue-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ReviewActionResult = { error: string | null };

export async function approveJobAction(
  assignmentId: string,
  reviewNotes: string | null,
): Promise<ReviewActionResult> {
  const profile = await requireRole(["owner", "admin", "supervisor"]);

  const result = await approveJob(assignmentId, profile.id, reviewNotes);

  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assignments");
  return { error: result.success ? null : result.error };
}

export async function needsRecleanFromReviewAction(
  assignmentId: string,
  reviewNotes: string | null,
): Promise<ReviewActionResult> {
  const profile = await requireRole(["owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  // Record reviewer details before transitioning status
  await supabase
    .from("assignments")
    .update({
      reviewed_by_id: profile.id,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes,
    })
    .eq("id", assignmentId);

  const result = await markNeedsReclean({
    assignmentId,
    currentStatus: "completed_pending_review",
  });

  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assignments");
  return { error: result.success ? null : result.error };
}
