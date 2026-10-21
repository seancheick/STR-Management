import "server-only";
import { visibleCalendarReservations } from "@/lib/services/calendar-history";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type CalendarSourceRecord = {
  id: string;
  owner_id: string;
  property_id: string;
  name: string;
  ical_url: string;
  platform: string;
  active: boolean;
  last_synced_at: string | null;
  created_at: string;
  properties: { name: string } | null;
};

export type SyncLogRecord = {
  id: string;
  calendar_source_id: string;
  property_id: string;
  result: string;
  events_found: number;
  assignments_created: number;
  assignments_skipped: number;
  conflict_count: number;
  error_message: string | null;
  synced_at: string;
  calendar_source: { name: string; platform: string } | null;
  properties: { name: string } | null;
};

export async function listCalendarSources(): Promise<CalendarSourceRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("property_calendar_sources")
    .select(`
      id, owner_id, property_id, name, ical_url, platform,
      active, last_synced_at, created_at,
      properties:property_id ( name )
    `)
    .eq("active", true)
    .order("created_at", { ascending: false });
  return (data as unknown as CalendarSourceRecord[]) ?? [];
}

export async function listCalendarSourcesForProperty(
  propertyId: string,
): Promise<CalendarSourceRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("property_calendar_sources")
    .select(`
      id, owner_id, property_id, name, ical_url, platform,
      active, last_synced_at, created_at,
      properties:property_id ( name )
    `)
    .eq("active", true)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });
  return (data as unknown as CalendarSourceRecord[]) ?? [];
}

export async function listCalendarSourcesForSync(): Promise<{
  id: string;
  owner_id: string;
  property_id: string;
  ical_url: string;
  primary_checklist_template_id: string | null;
}[]> {
  // Cron/system context — no user session, so RLS would block this.
  // Service-role bypasses RLS; callers are gated by CRON_SECRET.
  const supabase = createServiceSupabaseClient();
  type Source = {
    id: string; owner_id: string; property_id: string; ical_url: string;
    properties: { primary_checklist_template_id: string | null } | null;
  };
  const rows: Source[] = [];
  // Load every page before syncing; never treat a failed read as an empty list.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("property_calendar_sources")
      .select(`id, owner_id, property_id, ical_url,
        properties:property_id!inner ( primary_checklist_template_id, active )`)
      .eq("active", true)
      .is("retired_at", null)
      .eq("properties.active", true)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error("Could not load calendar sources for sync.");
    rows.push(...((data ?? []) as unknown as Source[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows.map(row => ({
    id: row.id, owner_id: row.owner_id, property_id: row.property_id,
    ical_url: row.ical_url,
    primary_checklist_template_id: row.properties?.primary_checklist_template_id ?? null,
  }));
}

export type ReservationRecord = {
  id: string;
  property_id: string;
  listing_property_id?: string | null;
  historical?: boolean;
  platform: "airbnb" | "vrbo" | "booking" | "hostex" | "other";
  guest_name: string | null;
  start_at: string;
  end_at: string;
  summary: string | null;
  properties: { name: string } | null;
};

/**
 * Reservations whose window overlaps the inclusive [startISO, endISO] range —
 * i.e. any booking that is visible on the calendar grid.
 */
export async function listReservationsForRange(
  startISO: string,
  endISO: string,
): Promise<ReservationRecord[]> {
  const supabase = await createServerSupabaseClient();
  type SourceReservation = ReservationRecord & { calendar_source_id: string | null; source: { active: boolean; retired_at: string | null } | null };
  const rows: SourceReservation[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("reservations")
      .select(`
        id, property_id, listing_property_id, platform, guest_name, start_at, end_at, summary,
        calendar_source_id, source:calendar_source_id ( active, retired_at ),
        properties:property_id ( name )
      `)
      .lte("start_at", endISO)
      .gte("end_at", startISO)
      .order("start_at", { ascending: true }).order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as SourceReservation[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return visibleCalendarReservations(rows);
}

export async function listRecentSyncLogs(limit = 20): Promise<SyncLogRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("calendar_sync_logs")
    .select(`
      id, calendar_source_id, property_id, result,
      events_found, assignments_created, assignments_skipped,
      conflict_count, error_message, synced_at,
      calendar_source:calendar_source_id ( name, platform ),
      properties:property_id ( name )
    `)
    .order("synced_at", { ascending: false })
    .limit(limit);
  return (data as unknown as SyncLogRecord[]) ?? [];
}
