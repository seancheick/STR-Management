"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const postSchema = z.object({
  assignmentId: z.string().uuid(),
  body: z.string().trim().min(1, "Message can't be empty.").max(2000),
  messageType: z.enum(["text", "decline", "running_late", "system"]).default("text"),
  metadata: z.record(z.unknown()).optional(),
});

export type PostJobMessageState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export async function postJobMessageAction(
  _prev: PostJobMessageState,
  formData: FormData,
): Promise<PostJobMessageState> {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);

  const parsed = postSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    body: formData.get("body"),
    messageType: (formData.get("messageType") as string | null) ?? "text",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("job_messages").insert({
    assignment_id: parsed.data.assignmentId,
    author_id: profile.id,
    author_role: profile.role,
    body: parsed.data.body,
    message_type: parsed.data.messageType,
  });

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/jobs/${parsed.data.assignmentId}`);
  revalidatePath(`/dashboard/assignments`);
  revalidatePath(`/dashboard/schedule`);
  return { status: "success", message: null };
}

/** Server-side post used by other actions (decline, running-late) to append to the thread. */
export async function appendSystemJobMessage(
  assignmentId: string,
  body: string,
  messageType: "decline" | "running_late" | "system",
  metadata?: Record<string, unknown>,
): Promise<void> {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();
  await supabase.from("job_messages").insert({
    assignment_id: assignmentId,
    author_id: profile.id,
    author_role: profile.role,
    body,
    message_type: messageType,
    metadata: metadata ?? {},
  });
}
