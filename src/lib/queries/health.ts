import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type HealthReport = {
  calendarSources: Array<{
    id: string;
    property_name: string;
    platform: string;
    last_synced_at: string | null;
    stale_hours: number | null;
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
    active: number;
    inactive: number;
    stale_30d: number;
  };
  notifications: {
    last_24h_sent: number;
    last_24h_failed: number;
    pending: number;
  };
  assignments: {
    unassigned_next_7d: number;
    tight_turnovers_next_7d: number;
    stuck_pending_review: number;
  };
  database: {
    total_properties: number;
    total_active_cleaners: number;
    total_reservations: number;
    total_assignments: number;
  };
};

export async function getHealthReport(): Promise<HealthReport> {
  const supabase = createServiceSupabaseClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const h24 = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const h7d = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    sourcesRes,
    syncLogsRes,
    reminderLogsRes,
    recurringLogsRes,
    digestLogsRes,
    activePushRes,
    inactivePushRes,
    stalePushRes,
    sent24Res,
    failed24Res,
    pendingNotifRes,
    unassignedRes,
    pendingReviewRes,
    propertiesRes,
    cleanersRes,
    reservationsRes,
    assignmentsCountRes,
    weekAssignmentsRes,
  ] = await Promise.all([
    supabase
      .from("property_calendar_sources")
      .select(
        "id, platform, last_synced_at, properties:property_id (name)",
      )
      .eq("active", true),
    supabase
      .from("calendar_sync_logs")
      .select(
        "calendar_source_id, result, synced_at, events_found, assignments_created, conflict_count, error_message",
      )
      .order("synced_at", { ascending: false })
      .limit(200),
    // Reminder cron leaves no DB trace; infer from notifications of type reminder_*
    supabase
      .from("notifications")
      .select("created_at")
      .in("notification_type", ["reminder_24h", "reminder_2h"])
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("notifications")
      .select("created_at")
      .eq("notification_type", "overdue")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("notifications")
      .select("created_at")
      .eq("notification_type", "weekly_digest")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("device_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("device_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("active", false),
    supabase
      .from("device_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .lt("created_at", d30),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("created_at", h24),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", h24),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("status", "unassigned")
      .gte("due_at", nowIso)
      .lte("due_at", h7d),
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed_pending_review")
      .lt("due_at", h24),
    supabase.from("properties").select("id", { count: "exact", head: true }),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "cleaner")
      .eq("active", true),
    supabase.from("reservations").select("id", { count: "exact", head: true }),
    supabase.from("assignments").select("id", { count: "exact", head: true }),
    // Cleaning windows in the next 7d for tight-turn detection
    supabase
      .from("assignments")
      .select("checkout_at, next_checkin_at")
      .gte("due_at", nowIso)
      .lte("due_at", h7d)
      .not("status", "in", '("cancelled")'),
  ]);

  // Stitch latest sync log per calendar source
  const logsBySource = new Map<
    string,
    {
      result: string;
      synced_at: string;
      events_found: number;
      assignments_created: number;
      conflict_count: number;
      error_message: string | null;
    }
  >();
  for (const row of (syncLogsRes.data as unknown as Array<{
    calendar_source_id: string;
    result: string;
    synced_at: string;
    events_found: number;
    assignments_created: number;
    conflict_count: number;
    error_message: string | null;
  }>) ?? []) {
    if (!logsBySource.has(row.calendar_source_id)) {
      logsBySource.set(row.calendar_source_id, {
        result: row.result,
        synced_at: row.synced_at,
        events_found: row.events_found,
        assignments_created: row.assignments_created,
        conflict_count: row.conflict_count,
        error_message: row.error_message,
      });
    }
  }

  const calendarSources = (
    (sourcesRes.data as unknown as Array<{
      id: string;
      platform: string;
      last_synced_at: string | null;
      properties: { name: string } | null;
    }>) ?? []
  ).map((s) => ({
    id: s.id,
    property_name: s.properties?.name ?? "Unknown",
    platform: s.platform,
    last_synced_at: s.last_synced_at,
    stale_hours: s.last_synced_at
      ? Math.round((now - new Date(s.last_synced_at).getTime()) / 3_600_000)
      : null,
    sync_logs: logsBySource.get(s.id) ?? null,
  }));

  // Tight turn count
  const tightWindows = (weekAssignmentsRes.data as unknown as Array<{
    checkout_at: string | null;
    next_checkin_at: string | null;
  }>) ?? [];
  const tightCount = tightWindows.filter((a) => {
    if (!a.checkout_at || !a.next_checkin_at) return false;
    const gap =
      (new Date(a.next_checkin_at).getTime() - new Date(a.checkout_at).getTime()) /
      60_000;
    return gap > 0 && gap <= 360;
  }).length;

  return {
    calendarSources,
    crons: {
      last_sync_calendars_at:
        calendarSources
          .map((s) => s.last_synced_at)
          .filter(Boolean)
          .sort()
          .reverse()[0] ?? null,
      last_send_reminders_at:
        (reminderLogsRes.data as unknown as Array<{ created_at: string }>)?.[0]
          ?.created_at ?? null,
      last_recurring_tasks_at:
        (recurringLogsRes.data as unknown as Array<{ created_at: string }>)?.[0]
          ?.created_at ?? null,
      last_weekly_digest_at:
        (digestLogsRes.data as unknown as Array<{ created_at: string }>)?.[0]
          ?.created_at ?? null,
    },
    pushSubscriptions: {
      active: activePushRes.count ?? 0,
      inactive: inactivePushRes.count ?? 0,
      stale_30d: stalePushRes.count ?? 0,
    },
    notifications: {
      last_24h_sent: sent24Res.count ?? 0,
      last_24h_failed: failed24Res.count ?? 0,
      pending: pendingNotifRes.count ?? 0,
    },
    assignments: {
      unassigned_next_7d: unassignedRes.count ?? 0,
      tight_turnovers_next_7d: tightCount,
      stuck_pending_review: pendingReviewRes.count ?? 0,
    },
    database: {
      total_properties: propertiesRes.count ?? 0,
      total_active_cleaners: cleanersRes.count ?? 0,
      total_reservations: reservationsRes.count ?? 0,
      total_assignments: assignmentsCountRes.count ?? 0,
    },
  };
}
