"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { resolveOwnerId } from "@/lib/queries/properties";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const createSchema = z.object({
  propertyId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  cadence: z.enum(["weekly", "monthly", "quarterly", "annual"]),
  nextRunAt: z.string().min(1),
  assigneeId: z.string().uuid().optional().or(z.literal("")),
  fixedPayoutAmount: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), {
      message: "Payout must be positive.",
    }),
});

export type RecurringTaskActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export async function createRecurringTaskAction(
  _prev: RecurringTaskActionState,
  formData: FormData,
): Promise<RecurringTaskActionState> {
  await requireRole(["owner", "admin"]);

  const parsed = createSchema.safeParse({
    propertyId: formData.get("propertyId"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    cadence: formData.get("cadence"),
    nextRunAt: formData.get("nextRunAt"),
    assigneeId: formData.get("assigneeId") ?? "",
    fixedPayoutAmount: formData.get("fixedPayoutAmount") ?? "",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const ownerId = await resolveOwnerId();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("recurring_tasks").insert({
    owner_id: ownerId,
    property_id: parsed.data.propertyId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    cadence: parsed.data.cadence,
    next_run_at: parsed.data.nextRunAt,
    assignee_id: parsed.data.assigneeId ? parsed.data.assigneeId : null,
    fixed_payout_amount: parsed.data.fixedPayoutAmount,
    active: true,
  });

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/dashboard/properties/${parsed.data.propertyId}/edit`);
  return { status: "success", message: "Recurring task added." };
}

export async function deleteRecurringTaskAction(
  taskId: string,
  propertyId: string,
): Promise<{ error: string | null }> {
  await requireRole(["owner", "admin"]);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("recurring_tasks")
    .update({ active: false })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/properties/${propertyId}/edit`);
  return { error: null };
}
