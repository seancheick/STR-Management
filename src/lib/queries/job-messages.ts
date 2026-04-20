import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type JobMessageRecord = {
  id: string;
  assignment_id: string;
  author_id: string | null;
  author_role: string | null;
  body: string;
  message_type: "text" | "decline" | "running_late" | "system";
  metadata: Record<string, unknown> | null;
  created_at: string;
  author?: { full_name: string } | null;
};

export async function listJobMessages(
  assignmentId: string,
): Promise<JobMessageRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("job_messages")
    .select(
      `id, assignment_id, author_id, author_role, body, message_type, metadata, created_at,
       author:author_id ( full_name )`,
    )
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: true });
  return (data as unknown as JobMessageRecord[] | null) ?? [];
}
