import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("property_calendar_sources")
    .select(`
      id, owner_id, property_id, ical_url,
      properties:property_id ( primary_checklist_template_id )
    `)
    .eq("active", true);

  return ((data as unknown as {
    id: string;
    owner_id: string;
    property_id: string;
    ical_url: string;
    properties: { primary_checklist_template_id: string | null } | null;
  }[]) ?? []).map((row) => ({
    id: row.id,
    owner_id: row.owner_id,
    property_id: row.property_id,
    ical_url: row.ical_url,
    primary_checklist_template_id: row.properties?.primary_checklist_template_id ?? null,
  }));
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
