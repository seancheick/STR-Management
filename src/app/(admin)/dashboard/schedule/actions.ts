"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sendAssignmentBatchNotification } from "@/lib/notifications/notification-service";
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
  await requireRole(["owner", "admin"]);

  const parsed = quickAssignSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    cleanerId: formData.get("cleanerId"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Invalid input." };
  }

  const { bulkAssignCleanerAction } = await import("@/app/(admin)/dashboard/assignments/actions");
  const result = await bulkAssignCleanerAction([parsed.data.assignmentId], parsed.data.cleanerId,
    formData.get("assignmentMode") === "direct" ? "direct" : "request");
  if (result.error || !result.assigned) return { status: "error", message: result.error ?? "Cleaning is no longer unassigned. Refresh and review it." };

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/jobs/schedule");
  revalidatePath("/dashboard/notifications");
  return { status: "success", message: "Cleaner assigned. Notification sent." };
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
  const actor = await requireRole(["owner", "admin"]);

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
  const {data:before} = await supabase.from("assignments").select("cleaner_id").eq("id",data.assignmentId).eq("owner_id",actor.owner_id).maybeSingle();
  const { error } = await supabase.rpc("owner_manage_cleaning", {
    target_id: data.assignmentId,
    operation: "edit",
    assignment_patch: { due_at: data.dueAt, checkout_at: data.checkoutAt, cleaner_id: data.cleanerId,
      priority: data.priority, expected_duration_min: data.expectedDurationMin,
      fixed_payout_amount: data.fixedPayoutAmount, original_fixed_payout_amount: formData.get("originalPayoutAmount"), access_code: data.accessCode },
  });
  if (error) return { status: "error", message: error.message };

  if (data.cleanerId) await sendAssignmentBatchNotification(actor.owner_id,data.cleanerId,[data.assignmentId]).catch(error=>console.error("[job-notification]",error));
  if (before?.cleaner_id && before.cleaner_id !== data.cleanerId) await sendAssignmentBatchNotification(actor.owner_id,before.cleaner_id,[data.assignmentId],"removed").catch(error=>console.error("[job-notification]",error));
  revalidatePath("/jobs", "layout");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assignments");
  revalidatePath("/jobs");
  revalidatePath("/jobs/schedule");
  revalidatePath("/dashboard/notifications");
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

// ─── Mark paid (Zelle / Venmo / Cash / …) ──────────────────────────────────────

const markPaidSchema = z.object({
  assignmentId: z.string().uuid(),
  paymentMethod: z.enum(["zelle", "venmo", "cash", "check", "bank_transfer", "other"]),
  paymentReference: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v.length > 0 ? v : null))
    .nullable(),
});

export type MarkPaidState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export async function markPaidAction(
  _prev: MarkPaidState,
  formData: FormData,
): Promise<MarkPaidState> {
  await requireRole(["owner", "admin"]);

  const parsed = markPaidSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    paymentMethod: formData.get("paymentMethod"),
    paymentReference: (formData.get("paymentReference") as string | null) ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("set_cleaning_jobs_paid", {
    job_ids: [parsed.data.assignmentId], is_paid: true,
    paid_method: parsed.data.paymentMethod, payment_reference: parsed.data.paymentReference,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assignments");
  revalidatePath("/dashboard/payouts");
  return { status: "success", message: "Marked paid." };
}

export async function markUnpaidAction(
  assignmentId: string,
): Promise<{ error: string | null }> {
  await requireRole(["owner", "admin"]);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_cleaning_jobs_paid", {
    job_ids: [assignmentId], is_paid: false,
  });

  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assignments");
  revalidatePath("/dashboard/payouts");
  return { error: error?.message ?? null };
}

// ─── Bulk mark paid ────────────────────────────────────────────────────────────

const bulkMarkPaidSchema = z.object({
  assignmentIds: z.array(z.string().uuid()).min(1, "Pick at least one job."),
  paymentMethod: z.enum(["zelle", "venmo", "cash", "check", "bank_transfer", "other"]),
  paymentReference: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v.length > 0 ? v : null))
    .nullable(),
});

export async function bulkMarkPaidAction(input: {
  assignmentIds: string[];
  paymentMethod: string;
  paymentReference?: string | null;
}): Promise<{ ok: boolean; error?: string; count?: number }> {
  await requireRole(["owner", "admin"]);

  const parsed = bulkMarkPaidSchema.safeParse({
    assignmentIds: input.assignmentIds,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("set_cleaning_jobs_paid", {
    job_ids: parsed.data.assignmentIds, is_paid: true,
    paid_method: parsed.data.paymentMethod, payment_reference: parsed.data.paymentReference,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/payouts");
  revalidatePath("/dashboard/assignments");
  revalidatePath("/dashboard/schedule");
  return { ok: true, count: Number(data ?? 0) };
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

export async function manageCleaningAction(_prev: RescheduleState, formData: FormData): Promise<RescheduleState> {
  const actor = await requireRole(["owner", "admin"]);
  const parsed = z.object({ id: z.string().uuid(), operation: z.enum(["request", "direct", "complete"]), cleaner: z.string().uuid("Choose a cleaner.") }).safeParse({
    id: formData.get("assignmentId"), operation: formData.get("operation"), cleaner: formData.get("cleanerId"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  const supabase = await createServerSupabaseClient();
  const {data:before} = await supabase.from("assignments").select("cleaner_id").eq("id",parsed.data.id).eq("owner_id",actor.owner_id).maybeSingle();
  const { error } = await supabase.rpc("owner_manage_cleaning", { target_id: parsed.data.id, operation: parsed.data.operation,
    target_cleaner: parsed.data.cleaner, audit_reason: String(formData.get("reason") ?? ""), confirmed: formData.get("confirmed") === "on" });
  if (error) return { status: "error", message: error.message };
  await sendAssignmentBatchNotification(actor.owner_id,parsed.data.cleaner,[parsed.data.id],parsed.data.operation).catch(error=>console.error("[job-notification]",error));
  if(before?.cleaner_id && before.cleaner_id !== parsed.data.cleaner) await sendAssignmentBatchNotification(actor.owner_id,before.cleaner_id,[parsed.data.id],"removed").catch(error=>console.error("[job-notification]",error));
  revalidatePath("/jobs", "layout");
  for (const path of ["/dashboard", "/dashboard/assignments", "/dashboard/schedule", "/dashboard/payouts", "/jobs", "/jobs/inbox", "/jobs/schedule"]) revalidatePath(path);
  return { status: "success", message: parsed.data.operation === "complete" ? "Cleaning completed and approved." : parsed.data.operation === "direct" ? "Cleaning confirmed. No acceptance needed." : "Cleaning requested. Cleaner can accept or decline." };
}
