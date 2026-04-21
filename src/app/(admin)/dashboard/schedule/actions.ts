"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { sendNotification } from "@/lib/notifications/notification-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Look up the data we need to personalise an assignment notification. */
async function fetchAssignmentNotificationContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  assignmentId: string,
) {
  const { data } = await supabase
    .from("assignments")
    .select(
      "id, owner_id, property_id, due_at, checkout_at, properties:property_id ( name )",
    )
    .eq("id", assignmentId)
    .maybeSingle();
  return data as
    | {
        id: string;
        owner_id: string;
        property_id: string;
        due_at: string;
        checkout_at: string | null;
        properties: { name: string } | null;
      }
    | null;
}

function formatAnchorDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

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

  // Notify the cleaner. sendNotification inserts a notifications row AND
  // attempts a web-push delivery; failures are tolerated so the assign
  // operation itself never regresses because of delivery trouble.
  const ctx = await fetchAssignmentNotificationContext(supabase, parsed.data.assignmentId);
  if (ctx) {
    const anchor = ctx.checkout_at ?? ctx.due_at;
    await sendNotification({
      ownerId: ctx.owner_id,
      recipientId: parsed.data.cleanerId,
      assignmentId: ctx.id,
      type: "new_assignment",
      title: `New job: ${ctx.properties?.name ?? "Cleaning"}`,
      body: `${formatAnchorDate(anchor)} — tap to review and accept.`,
      url: `/jobs/${ctx.id}`,
    }).catch(() => undefined);
  }

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

  const cleanerChanged =
    data.cleanerId !== current.cleaner_id && data.cleanerId !== null;

  if (data.cleanerId === null && current.cleaner_id !== null) {
    patch.status = "unassigned";
    patch.ack_status = "pending";
  } else if (
    cleanerChanged &&
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

  // Notify the newly-assigned cleaner when the cleaner changes.
  // Also notify the PREVIOUS cleaner when they're being swapped out or
  // unassigned — they were expecting this job and need to know it's gone.
  if (cleanerChanged && data.cleanerId) {
    const ctx = await fetchAssignmentNotificationContext(supabase, data.assignmentId);
    if (ctx) {
      const anchor = ctx.checkout_at ?? ctx.due_at;
      await sendNotification({
        ownerId: ctx.owner_id,
        recipientId: data.cleanerId,
        assignmentId: ctx.id,
        type: "new_assignment",
        title: `New job: ${ctx.properties?.name ?? "Cleaning"}`,
        body: `${formatAnchorDate(anchor)} — tap to review and accept.`,
        url: `/jobs/${ctx.id}`,
      }).catch(() => undefined);

      if (current.cleaner_id && current.cleaner_id !== data.cleanerId) {
        await sendNotification({
          ownerId: ctx.owner_id,
          recipientId: current.cleaner_id,
          assignmentId: ctx.id,
          type: "new_assignment",
          title: `Job reassigned`,
          body: `${ctx.properties?.name ?? "Cleaning"} on ${formatAnchorDate(anchor)} is no longer on your schedule.`,
          url: `/jobs`,
        }).catch(() => undefined);
      }
    }
  } else if (data.cleanerId === null && current.cleaner_id !== null) {
    // Cleaner was removed entirely (back to unassigned).
    const ctx = await fetchAssignmentNotificationContext(supabase, data.assignmentId);
    if (ctx) {
      const anchor = ctx.checkout_at ?? ctx.due_at;
      await sendNotification({
        ownerId: ctx.owner_id,
        recipientId: current.cleaner_id,
        assignmentId: ctx.id,
        type: "new_assignment",
        title: `Job unassigned`,
        body: `${ctx.properties?.name ?? "Cleaning"} on ${formatAnchorDate(anchor)} was removed from your schedule.`,
        url: `/jobs`,
      }).catch(() => undefined);
    }
  }

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
  const profile = await requireRole(["owner", "admin"]);

  const parsed = markPaidSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    paymentMethod: formData.get("paymentMethod"),
    paymentReference: (formData.get("paymentReference") as string | null) ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createServerSupabaseClient();

  // Only approved / completed jobs can be paid. Re-paying is a no-op update.
  const { error } = await supabase
    .from("assignments")
    .update({
      paid_at: new Date().toISOString(),
      payment_method: parsed.data.paymentMethod,
      payment_reference: parsed.data.paymentReference,
      marked_paid_by_user_id: profile.id,
    })
    .eq("id", parsed.data.assignmentId)
    .in("status", ["approved", "completed", "completed_pending_review"]);

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
  const { error } = await supabase
    .from("assignments")
    .update({
      paid_at: null,
      payment_method: null,
      payment_reference: null,
      marked_paid_by_user_id: null,
    })
    .eq("id", assignmentId);

  revalidatePath("/dashboard/schedule");
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
  const profile = await requireRole(["owner", "admin"]);

  const parsed = bulkMarkPaidSchema.safeParse({
    assignmentIds: input.assignmentIds,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("assignments")
    .update({
      paid_at: new Date().toISOString(),
      payment_method: parsed.data.paymentMethod,
      payment_reference: parsed.data.paymentReference,
      marked_paid_by_user_id: profile.id,
    })
    .in("id", parsed.data.assignmentIds)
    .in("status", ["approved", "completed", "completed_pending_review"])
    .select("id");

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/payouts");
  revalidatePath("/dashboard/assignments");
  revalidatePath("/dashboard/schedule");
  return { ok: true, count: (data ?? []).length };
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
