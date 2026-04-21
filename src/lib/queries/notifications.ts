import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type NotificationRecord = {
  id: string;
  recipient_id: string;
  assignment_id: string | null;
  channel: string;
  status: string;
  notification_type: string;
  title: string;
  body: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  recipient: { full_name: string } | null;
  assignment: { properties: { name: string } | null } | null;
};

export async function listRecentNotifications(limit = 50): Promise<NotificationRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("notifications")
    .select(`
      id, recipient_id, assignment_id, channel, status,
      notification_type, title, body, sent_at, error_message, created_at,
      recipient:recipient_id ( full_name ),
      assignment:assignment_id ( properties:property_id ( name ) )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as unknown as NotificationRecord[]) ?? [];
}

/** Notifications addressed to a specific cleaner — their personal inbox. */
export async function listNotificationsForCleaner(
  cleanerId: string,
  limit = 50,
): Promise<NotificationRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("notifications")
    .select(`
      id, recipient_id, assignment_id, channel, status,
      notification_type, title, body, sent_at, error_message, created_at,
      recipient:recipient_id ( full_name ),
      assignment:assignment_id ( properties:property_id ( name ) )
    `)
    .eq("recipient_id", cleanerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as unknown as NotificationRecord[]) ?? [];
}

export async function getNotificationStats(): Promise<{
  total: number;
  sent: number;
  failed: number;
  pending: number;
}> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("notifications")
    .select("status");

  const rows = (data ?? []) as { status: string }[];
  return {
    total: rows.length,
    sent: rows.filter((r) => r.status === "sent").length,
    failed: rows.filter((r) => r.status === "failed").length,
    pending: rows.filter((r) => r.status === "pending").length,
  };
}
