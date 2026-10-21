import "server-only";

import { requireRole } from "@/lib/auth/session";
import { isTightTurnover } from "@/lib/domain/assignments";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type HealthReport = {
  checkedAt: string;
  unavailableChecks: string[];
  calendarSources: Array<{
    id: string;
    property_name: string;
    platform: string;
    last_synced_at: string | null;
    check_error: boolean;
    sync_logs: {
      result: string;
      synced_at: string;
      events_found: number;
      assignments_created: number;
      conflict_count: number;
      error_message: string | null;
    } | null;
  }>;
  crons: {
    last_sync_calendars_at: string | null;
    last_send_reminders_at: string | null;
    last_recurring_tasks_at: string | null;
    last_weekly_digest_at: string | null;
  };
  pushSubscriptions: {
    active: number | null;
    inactive: number | null;
    stale_30d: number | null;
  };
  notifications: {
    last_24h_sent: number | null;
    last_24h_failed: number | null;
    pending: number | null;
  };
  assignments: {
    unassigned_next_7d: number | null;
    tight_turnovers_next_7d: number | null;
    stuck_pending_review: number | null;
  };
  database: {
    total_properties: number | null;
    total_active_cleaners: number | null;
    total_reservations: number | null;
    total_assignments: number | null;
  };
};

export async function getHealthReport(): Promise<HealthReport> {
  const profile = await requireRole(["owner", "admin"]);
  const supabase = createServiceSupabaseClient();
  const ownerId = profile.owner_id;
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();
  const h24 = new Date(now - 24 * 3_600_000).toISOString();
  const h7d = new Date(now + 7 * 24 * 3_600_000).toISOString();
  const d30 = new Date(now - 30 * 24 * 3_600_000).toISOString();
  // Service access is needed for team devices; every query is tenant-scoped.
  const count = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("owner_id", ownerId);
  const devices = () => supabase.from("device_subscriptions").select("id, users!inner(owner_id)", { count: "exact", head: true }).eq("users.owner_id", ownerId);
  const [sourcesRes, reminderRes, digestRes, activeRes, inactiveRes, olderRes,
    sentRes, failedRes, pendingRes, unassignedRes, reviewRes, propertiesRes,
    cleanersRes, reservationsRes, assignmentsRes, windowsRes] = await Promise.all([
    supabase.from("property_calendar_sources").select("id, platform, last_synced_at, properties:property_id(name)").eq("owner_id", ownerId).eq("active", true),
    supabase.from("notifications").select("created_at").eq("owner_id", ownerId).in("notification_type", ["reminder_24h", "reminder_2h"]).order("created_at", { ascending: false }).limit(1),
    supabase.from("notifications").select("created_at").eq("owner_id", ownerId).eq("notification_type", "weekly_digest").order("created_at", { ascending: false }).limit(1),
    devices().eq("active", true), devices().eq("active", false), devices().eq("active", true).lt("created_at", d30),
    count("notifications").eq("status", "sent").gte("sent_at", h24),
    count("notifications").eq("status", "failed").gte("created_at", h24),
    count("notifications").eq("status", "pending"),
    count("assignments").eq("status", "unassigned").gte("due_at", checkedAt).lte("due_at", h7d),
    count("assignments").eq("status", "completed_pending_review").lt("completed_at", h24),
    count("properties"), count("cleaners").eq("role", "cleaner").eq("active", true),
    count("reservations"), count("assignments"),
    supabase.from("assignments").select("checkout_at, next_checkin_at").eq("owner_id", ownerId).gte("due_at", checkedAt).lte("due_at", h7d).not("status", "in", '("cancelled","approved","completed_pending_review")').limit(1000),
  ]);
  const unavailableChecks: string[] = [];
  const checked = <T extends { error: unknown }>(label: string, result: T): T => {
    if (result.error) unavailableChecks.push(label);
    return result;
  };
  const total = (label: string, result: { error: unknown; count: number | null }): number | null => {
    checked(label, result);
    return result.error ? null : result.count;
  };
  checked("Calendar sources", sourcesRes);
  checked("Reminder activity", reminderRes);
  checked("Weekly summary activity", digestRes);
  checked("Tight cleaning windows", windowsRes);
  const calendarSources = await Promise.all((sourcesRes.data ?? []).map(async (source) => {
    // Fetch the latest result for each source; a global log limit can hide a
    // quieter source behind a frequently synced source's history.
    const logRes = await supabase.from("calendar_sync_logs")
      .select("result, synced_at, events_found, assignments_created, conflict_count, error_message")
      .eq("owner_id", ownerId).eq("calendar_source_id", source.id)
      .order("synced_at", { ascending: false }).limit(1).maybeSingle();
    checked("Calendar sync result", logRes);
    const property = source.properties as unknown as { name: string } | null;
    return { id: source.id, property_name: property?.name ?? "Unknown property", platform: source.platform,
      last_synced_at: source.last_synced_at, check_error: !!logRes.error, sync_logs: logRes.data };
  }));
  // A saturated API page is not a reliable complete count.
  if ((windowsRes.data?.length ?? 0) >= 1000) unavailableChecks.push("Tight cleaning windows");
  const tightCount = windowsRes.error || (windowsRes.data?.length ?? 0) >= 1000 ? null
    : (windowsRes.data ?? []).filter((job) => isTightTurnover(job.checkout_at, job.next_checkin_at)).length;
  return {
    checkedAt, unavailableChecks,
    calendarSources,
    crons: {
      last_sync_calendars_at: calendarSources.map((source) => source.sync_logs?.synced_at ?? null).filter((iso): iso is string => !!iso).sort().at(-1) ?? null,
      last_send_reminders_at: reminderRes.data?.[0]?.created_at ?? null,
      // No persistent run log exists. Overdue notifications belong to the
      // reminder job, so they cannot establish a recurring-task run.
      last_recurring_tasks_at: null,
      last_weekly_digest_at: digestRes.data?.[0]?.created_at ?? null,
    },
    pushSubscriptions: { active: total("Active push subscriptions", activeRes), inactive: total("Inactive push subscriptions", inactiveRes), stale_30d: total("Older push subscriptions", olderRes) },
    notifications: { last_24h_sent: total("Sent notifications", sentRes), last_24h_failed: total("Failed notifications", failedRes), pending: total("Queued notifications", pendingRes) },
    assignments: { unassigned_next_7d: total("Unassigned cleanings", unassignedRes), tight_turnovers_next_7d: tightCount, stuck_pending_review: total("Cleanings awaiting review", reviewRes) },
    database: { total_properties: total("Properties", propertiesRes), total_active_cleaners: total("Active cleaners", cleanersRes), total_reservations: total("Reservations", reservationsRes), total_assignments: total("Assignments", assignmentsRes) },
  };
}
