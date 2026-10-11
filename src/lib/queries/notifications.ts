import "server-only";
import { currentCleanerNotifications } from "@/lib/services/cleaner-inbox";

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
  seen_at: string | null;
  error_message: string | null;
  created_at: string;
  recipient: { full_name: string } | null;
  assignment:
    | {
        status: string;
        ack_status: string;
        cleaner_id: string | null;
        due_at: string;
        checkout_at: string | null;
        properties: { name: string; timezone: string } | null;
        listing_properties?: { name: string; timezone: string } | null;
      }
    | null;
};

/** Badge and inbox share the same visibility and delivery-copy rules. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const rows: NotificationRecord[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("notifications").select(`
      id, assignment_id, notification_type, seen_at,
      assignment:assignment_id ( status, ack_status, cleaner_id )
    `).eq("recipient_id", userId).order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as NotificationRecord[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return currentCleanerNotifications(rows).filter(row => !row.seen_at &&
    !(row.notification_type === "new_assignment" && row.assignment?.ack_status === "accepted")).length;
}

export async function listRecentNotifications(limit = 50): Promise<NotificationRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(`
      id, recipient_id, assignment_id, channel, status,
      notification_type, title, body, sent_at, seen_at, error_message, created_at,
      recipient:recipient_id ( full_name ),
      assignment:assignment_id ( status, ack_status, cleaner_id, due_at, checkout_at, properties:property_id ( name, timezone ), listing_properties:assignments_listing_property_fk ( name, timezone ) )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as unknown as NotificationRecord[]) ?? [];
}

/** Notifications addressed to a specific cleaner — their personal inbox. */
export async function listNotificationsForCleaner(
  cleanerId: string,
  limit = 50,
): Promise<NotificationRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(`
      id, recipient_id, assignment_id, channel, status,
      notification_type, title, body, sent_at, seen_at, error_message, created_at,
      recipient:recipient_id ( full_name ),
      assignment:assignment_id ( status, ack_status, cleaner_id, due_at, checkout_at, properties:property_id ( name, timezone ), listing_properties:assignments_listing_property_fk ( name, timezone ) )
    `)
    .eq("recipient_id", cleanerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
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
