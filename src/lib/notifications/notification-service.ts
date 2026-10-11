import "server-only";
import { withListingConfiguration } from "@/lib/services/booking-configuration";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { sendPushToUser } from "./push";

export type NotificationType =
  | "new_assignment"
  | "weekly_digest"
  | "reminder_24h"
  | "reminder_2h"
  | "overdue"
  | "sla_breach"
  | "assignment_rescheduled"
  | "assignment_cancelled";

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

  // Insert notification record and capture its id so the status update
  // later targets THIS exact row. The previous "match by recipient + type +
  // sent_at IS NULL" pattern raced under concurrent crons and could flip
  // the status of an unrelated row.
  const { data: inserted, error: insertError } = await supabase
    .from("notifications")
    .insert({
      owner_id: input.ownerId,
      recipient_id: input.recipientId,
      assignment_id: input.assignmentId,
      channel: "push",
      status: "pending",
      notification_type: input.type,
      title: input.title,
      body: input.body,
    })
    .select("id")
    .single();

  // If the insert failed (e.g., RLS rejected, FK violation) there's nothing
  // to update — log and bail. Push delivery still happens so users with
  // legacy subscriptions aren't blocked by a logging failure.
  if (insertError || !inserted) {
    console.error("[sendNotification] insert failed", insertError);
  }

  // Attempt push delivery
  const results = await sendPushToUser(input.recipientId, {
    title: input.title,
    body: input.body,
    url: input.url,
    tag: input.assignmentId ?? undefined,
  });

  if (!inserted) return;

  const allFailed = results.every((r) => !r.success);
  const firstError = results.find((r) => !r.success && "error" in r);

  await supabase
    .from("notifications")
    .update({
      status: allFailed ? "failed" : "sent",
      sent_at: allFailed ? null : new Date().toISOString(),
      error_message:
        allFailed && firstError && "error" in firstError ? firstError.error : null,
    })
    .eq("id", inserted.id);
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
    .select("id, owner_id, cleaner_id, due_at, status, ack_status, properties:property_id ( name ), listing_properties:assignments_listing_property_fk(name)")
    .in("status", ["assigned", "confirmed"])
    .neq("ack_status", "accepted")
    .gte("due_at", now)
    .lte("due_at", cutoff);

  return ((data as unknown as AtRiskAssignment[]) ?? []).map(withListingConfiguration);
}

/**
 * Find assignments that are overdue (due_at < now, not completed/cancelled).
 */
export async function findOverdueAssignments(): Promise<AtRiskAssignment[]> {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  const { data } = await supabase
    .from("assignments")
    .select("id, owner_id, cleaner_id, due_at, status, ack_status, properties:property_id ( name ), listing_properties:assignments_listing_property_fk(name)")
    .not("status", "in", '("completed_pending_review","approved","cancelled","needs_reclean")')
    .lt("due_at", now);

  return ((data as unknown as AtRiskAssignment[]) ?? []).map(withListingConfiguration);
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
    .select("id, owner_id, cleaner_id, due_at, status, ack_status, properties:property_id ( name ), listing_properties:assignments_listing_property_fk(name)")
    .eq("status", "unassigned")
    .gte("due_at", now)
    .lte("due_at", slaWindow);

  return ((data as unknown as AtRiskAssignment[]) ?? []).map(withListingConfiguration);
}

/** Individual inbox offers, one push alert for the batch. Only newly assigned IDs. */
export async function sendAssignmentBatchNotification(ownerId: string, cleanerId: string, ids: string[]) {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("notifications").select("id")
    .eq("owner_id", ownerId).eq("recipient_id", cleanerId).eq("notification_type", "new_assignment")
    .eq("status", "pending").in("assignment_id", ids);
  if (error) { console.error("[batch-notification]", error); return; }
  const results = await sendPushToUser(cleanerId, {
    title: ids.length === 1 ? "New cleaning assignment" : `${ids.length} new cleaning assignments`,
    body: "Open your inbox to review each cleaning and accept or decline.",
    url: "/jobs/inbox", tag: `assignment-batch-${ids[0]}`,
  });
  const sent = results.some((result) => result.success);
  const failure = results.find((result) => !result.success);
  await supabase.from("notifications").update({
    status: sent ? "sent" : "failed", sent_at: sent ? new Date().toISOString() : null,
    error_message: !sent && failure && "error" in failure ? failure.error : null,
  }).in("id", (data ?? []).map((row) => row.id));
}
