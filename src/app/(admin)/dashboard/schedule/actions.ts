"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const quickAssignSchema = z.object({
  assignmentId: z.string().uuid(),
  cleanerId: z.string().uuid(),
});

export type QuickAssignState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export async function quickAssignAction(
  _prev: QuickAssignState,
  formData: FormData,
): Promise<QuickAssignState> {
  await requireRole(["owner", "admin", "supervisor"]);

  const parsed = quickAssignSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    cleanerId: formData.get("cleanerId"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Invalid input." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("assignments")
    .update({
      cleaner_id: parsed.data.cleanerId,
      status: "assigned",
      ack_status: "pending",
    })
    .eq("id", parsed.data.assignmentId)
    .eq("status", "unassigned"); // only allow assigning unassigned jobs

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/jobs/schedule");
  return { status: "success", message: "Cleaner assigned." };
}

// ─── Reschedule ────────────────────────────────────────────────────────────────

const rescheduleSchema = z.object({
  assignmentId: z.string().uuid(),
  dueAt: z.string().min(1, "Due date required."),
  checkoutAt: z
    .string()
    .transform((v) => (v && v.length > 0 ? v : null))
    .nullable(),
  cleanerId: z
    .string()
    .transform((v) => (v && v.length > 0 ? v : null))
    .nullable()
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, {
      message: "Invalid cleaner.",
    }),
  priority: z.enum(["normal", "high", "urgent"]),
  expectedDurationMin: z
    .string()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .nullable()
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), {
      message: "Duration must be positive.",
    }),
  fixedPayoutAmount: z
    .string()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .nullable()
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), {
      message: "Payout must be positive.",
    }),
  accessCode: z
    .string()
    .trim()
    .max(64)
    .transform((v) => (v.length > 0 ? v : null))
    .nullable(),
});

export type RescheduleState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export async function rescheduleAssignmentAction(
  _prev: RescheduleState,
  formData: FormData,
): Promise<RescheduleState> {
  await requireRole(["owner", "admin", "supervisor"]);

  const parsed = rescheduleSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    dueAt: formData.get("dueAt"),
    checkoutAt: formData.get("checkoutAt") ?? "",
    cleanerId: formData.get("cleanerId") ?? "",
    priority: formData.get("priority") ?? "normal",
    expectedDurationMin: formData.get("expectedDurationMin") ?? "",
    fixedPayoutAmount: formData.get("fixedPayoutAmount") ?? "",
    accessCode: formData.get("accessCode") ?? "",
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid input.";
    return { status: "error", message: first };
  }

  const data = parsed.data;
  const supabase = await createServerSupabaseClient();

  // If the cleaner is being changed (including set/unset), update status accordingly:
  // - cleaner removed → unassigned
  // - cleaner added to previously unassigned → assigned (ack pending)
  // - otherwise keep existing status
  const { data: current, error: fetchError } = await supabase
    .from("assignments")
    .select("cleaner_id, status")
    .eq("id", data.assignmentId)
    .maybeSingle();

  if (fetchError || !current) {
    return { status: "error", message: fetchError?.message ?? "Assignment not found." };
  }

  // Conflict guard: once the cleaner has started, timing/cleaner are locked.
  // Admin can still bump priority/duration/payout on an in-progress job.
  const editable = ["unassigned", "assigned", "confirmed", "needs_reclean"];
  if (!editable.includes(current.status)) {
    return {
      status: "error",
      message:
        current.status === "in_progress"
          ? "Job is in progress. Cancel and recreate instead of rescheduling."
          : `Cannot edit an assignment in '${current.status.replace(/_/g, " ")}' state.`,
    };
  }

  const patch: Record<string, unknown> = {
    due_at: data.dueAt,
    checkout_at: data.checkoutAt,
    cleaner_id: data.cleanerId,
    priority: data.priority,
    expected_duration_min: data.expectedDurationMin,
    fixed_payout_amount: data.fixedPayoutAmount,
    access_code: data.accessCode,
  };

  if (data.cleanerId === null && current.cleaner_id !== null) {
    patch.status = "unassigned";
    patch.ack_status = "pending";
  } else if (
    data.cleanerId !== null &&
    data.cleanerId !== current.cleaner_id &&
    (current.status === "unassigned" || current.cleaner_id === null)
  ) {
    patch.status = "assigned";
    patch.ack_status = "pending";
  }

  const { error } = await supabase
    .from("assignments")
    .update(patch)
    .eq("id", data.assignmentId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assignments");
  revalidatePath("/jobs");
  revalidatePath("/jobs/schedule");
  return { status: "success", message: "Assignment updated." };
}

// ─── Cancel (soft delete) ──────────────────────────────────────────────────────

const cancelSchema = z.object({
  assignmentId: z.string().uuid(),
});

export type CancelState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export async function cancelAssignmentAction(
  _prev: CancelState,
  formData: FormData,
): Promise<CancelState> {
  await requireRole(["owner", "admin", "supervisor"]);

  const parsed = cancelSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Invalid input." };
  }

  const supabase = await createServerSupabaseClient();

  // Only allow cancellation of pre-completion jobs
  const { error } = await supabase
    .from("assignments")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.assignmentId)
    .in("status", ["unassigned", "assigned", "confirmed", "needs_reclean"]);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assignments");
  revalidatePath("/jobs");
  revalidatePath("/jobs/schedule");
  return { status: "success", message: "Assignment deleted." };
}

// ─── Unassign cleaner ──────────────────────────────────────────────────────────

export async function unassignCleanerAction(
  _prev: QuickAssignState,
  formData: FormData,
): Promise<QuickAssignState> {
  await requireRole(["owner", "admin", "supervisor"]);

  const parsed = z
    .object({ assignmentId: z.string().uuid() })
    .safeParse({ assignmentId: formData.get("assignmentId") });

  if (!parsed.success) {
    return { status: "error", message: "Invalid input." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("assignments")
    .update({
      cleaner_id: null,
      status: "unassigned",
      ack_status: "pending",
    })
    .eq("id", parsed.data.assignmentId)
    .in("status", ["assigned", "confirmed", "needs_reclean"]);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assignments");
  revalidatePath("/jobs");
  revalidatePath("/jobs/schedule");
  return { status: "success", message: "Cleaner unassigned." };
}
