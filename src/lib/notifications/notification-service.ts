import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { sendPushToUser } from "./push";

export type NotificationType =
  | "new_assignment"
  | "weekly_digest"
  | "reminder_24h"
  | "reminder_2h"
  | "overdue"
  | "sla_breach";

type SendNotificationInput = {
  ownerId: string | null;
  recipientId: string;
  assignmentId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
};

export async function sendNotification(input: SendNotificationInput): Promise<void> {
  const supabase = createServiceSupabaseClient();

  // Insert notification record first
  await supabase.from("notifications").insert({
    owner_id: input.ownerId,
    recipient_id: input.recipientId,
    assignment_id: input.assignmentId,
    channel: "push",
    status: "pending",
    notification_type: input.type,
    title: input.title,
    body: input.body,
  });

  // Attempt push delivery
  const results = await sendPushToUser(input.recipientId, {
    title: input.title,
    body: input.body,
    url: input.url,
    tag: input.assignmentId ?? undefined,
  });

  const allFailed = results.every((r) => !r.success);
  const firstError = results.find((r) => !r.success && "error" in r);

  // Update notification status
  await supabase
    .from("notifications")
    .update({
      status: allFailed ? "failed" : "sent",
      sent_at: allFailed ? null : new Date().toISOString(),
      error_message: allFailed && firstError && "error" in firstError
        ? firstError.error
        : null,
    })
    .eq("recipient_id", input.recipientId)
    .eq("notification_type", input.type)
    .is("sent_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
}

// ─── SLA helpers ─────────────────────────────────────────────────────────────

type AtRiskAssignment = {
  id: string;
  owner_id: string;
  cleaner_id: string | null;
  due_at: string;
  status: string;
  ack_status: string;
  properties: { name: string } | null;
};

/**
 * Find assignments due within the next `withinHours` hours that are not yet accepted.
 */
export async function findUnacceptedDueSoon(withinHours: number): Promise<AtRiskAssignment[]> {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() + withinHours * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("assignments")
    .select("id, owner_id, cleaner_id, due_at, status, ack_status, properties:property_id ( name )")
    .in("status", ["assigned", "confirmed"])
    .neq("ack_status", "accepted")
    .gte("due_at", now)
    .lte("due_at", cutoff);

  return (data as unknown as AtRiskAssignment[]) ?? [];
}

/**
 * Find assignments that are overdue (due_at < now, not completed/cancelled).
 */
export async function findOverdueAssignments(): Promise<AtRiskAssignment[]> {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  const { data } = await supabase
    .from("assignments")
    .select("id, owner_id, cleaner_id, due_at, status, ack_status, properties:property_id ( name )")
    .not("status", "in", '("completed_pending_review","approved","cancelled","needs_reclean")')
    .lt("due_at", now);

  return (data as unknown as AtRiskAssignment[]) ?? [];
}

/**
 * Find unassigned assignments past SLA (due within 2h with no cleaner).
 */
export async function findSLABreaches(): Promise<AtRiskAssignment[]> {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const slaWindow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("assignments")
    .select("id, owner_id, cleaner_id, due_at, status, ack_status, properties:property_id ( name )")
    .eq("status", "unassigned")
    .gte("due_at", now)
    .lte("due_at", slaWindow);

  return (data as unknown as AtRiskAssignment[]) ?? [];
}
