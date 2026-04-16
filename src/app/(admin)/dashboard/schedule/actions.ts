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
  return { status: "success", message: "Cleaner assigned." };
}
