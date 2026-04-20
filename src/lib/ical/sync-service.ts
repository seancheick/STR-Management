import "server-only";

import { parseIcal, type TurnoverCandidate } from "./parser";
import { DEFAULT_TIMEZONE } from "./timezone";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SyncSourceInput = {
  calendarSourceId: string;
  ownerId: string;
  propertyId: string;
  primaryChecklistTemplateId: string | null;
};

export type SyncResult = {
  eventsFound: number;
  assignmentsCreated: number;
  assignmentsSkipped: number;
  conflictCount: number;
  conflicts: ConflictWarning[];
  error?: string;
};

export type ConflictWarning = {
  uid: string;
  dueAt: string;
  reason: "overlap" | "cleaner_overload";
  details: string;
};

/** Fetch raw iCal text from a URL. */
async function fetchIcal(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "AirbnbOpsPortal/1.0" },
    // 10 second timeout
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`iCal fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * Check for overlapping assignments at the same property within ±4 hours of dueAt.
 */
async function detectOverlap(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  propertyId: string,
  dueAt: string,
): Promise<boolean> {
  const windowStart = new Date(new Date(dueAt).getTime() - 4 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(dueAt).getTime() + 4 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("assignments")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .not("status", "in", '("cancelled","needs_reclean")')
    .gte("due_at", windowStart)
    .lte("due_at", windowEnd);

  return (count ?? 0) > 0;
}

/**
 * Check if the property's default cleaner already has another job within ±2 hours.
 */
async function detectCleanerOverload(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  propertyId: string,
  dueAt: string,
): Promise<boolean> {
  // Get default_cleaner_id
  const { data: property } = await supabase
    .from("properties")
    .select("default_cleaner_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property?.default_cleaner_id) return false;

  const windowStart = new Date(new Date(dueAt).getTime() - 2 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(dueAt).getTime() + 2 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("assignments")
    .select("id", { count: "exact", head: true })
    .eq("cleaner_id", property.default_cleaner_id)
    .not("status", "in", '("cancelled","needs_reclean")')
    .gte("due_at", windowStart)
    .lte("due_at", windowEnd);

  return (count ?? 0) > 0;
}

/**
 * Import a single TurnoverCandidate idempotently.
 * Dedup key: (property_id, source_reference) — the UNIQUE constraint in the schema.
 */
async function importCandidate(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: SyncSourceInput,
  candidate: TurnoverCandidate,
): Promise<{ created: boolean; conflict: ConflictWarning | null }> {
  const sourceRef = `ical:${candidate.uid}`;

  // Check if already imported
  const { data: existing } = await supabase
    .from("assignments")
    .select("id")
    .eq("property_id", input.propertyId)
    .eq("source_reference", sourceRef)
    .maybeSingle();

  if (existing) {
    return { created: false, conflict: null };
  }

  // Conflict detection
  const [hasOverlap, hasOverload] = await Promise.all([
    detectOverlap(supabase, input.propertyId, candidate.dueAt),
    detectCleanerOverload(supabase, input.propertyId, candidate.dueAt),
  ]);

  let conflict: ConflictWarning | null = null;
  if (hasOverlap) {
    conflict = {
      uid: candidate.uid,
      dueAt: candidate.dueAt,
      reason: "overlap",
      details: `Another assignment exists within 4h of ${candidate.dueAt} for this property.`,
    };
  } else if (hasOverload) {
    conflict = {
      uid: candidate.uid,
      dueAt: candidate.dueAt,
      reason: "cleaner_overload",
      details: `Default cleaner already has a job within 2h of ${candidate.dueAt}.`,
    };
  }

  // Insert regardless of conflict (conflict is surfaced as a warning, not a blocker)
  const { error } = await supabase.from("assignments").insert({
    owner_id: input.ownerId,
    property_id: input.propertyId,
    cleaner_id: null,
    assignment_type: "cleaning",
    status: "unassigned",
    ack_status: "pending",
    priority: "normal",
    checkout_at: candidate.checkoutAt,
    due_at: candidate.dueAt,
    source_type: "ical",
    source_reference: sourceRef,
    created_by_user_id: input.ownerId,
  });

  if (error) {
    // Unique constraint violation = already exists (race condition)
    if (error.code === "23505") {
      return { created: false, conflict: null };
    }
    throw new Error(error.message);
  }

  // Snapshot checklist if template available
  if (input.primaryChecklistTemplateId) {
    const { data: templateItems } = await supabase
      .from("checklist_template_items")
      .select("id, section_name, label, required, photo_category, sort_order")
      .eq("template_id", input.primaryChecklistTemplateId)
      .order("sort_order");

    if (templateItems?.length) {
      // Get the just-created assignment id
      const { data: newAssignment } = await supabase
        .from("assignments")
        .select("id")
        .eq("property_id", input.propertyId)
        .eq("source_reference", sourceRef)
        .maybeSingle();

      if (newAssignment) {
        await supabase.from("assignment_checklist_items").insert(
          templateItems.map((item) => ({
            assignment_id: newAssignment.id,
            template_item_id: item.id,
            section_name: item.section_name,
            label: item.label,
            required: item.required,
            photo_category: item.photo_category,
            sort_order: item.sort_order,
          })),
        );
      }
    }
  }

  return { created: true, conflict };
}

export async function syncCalendarSource(input: SyncSourceInput): Promise<SyncResult> {
  const supabase = await createServerSupabaseClient();

  // Fetch the source record for the URL
  const { data: source } = await supabase
    .from("property_calendar_sources")
    .select("ical_url")
    .eq("id", input.calendarSourceId)
    .maybeSingle();

  if (!source) {
    return {
      eventsFound: 0,
      assignmentsCreated: 0,
      assignmentsSkipped: 0,
      conflictCount: 0,
      conflicts: [],
      error: "Calendar source not found.",
    };
  }

  let rawIcal: string;
  try {
    rawIcal = await fetchIcal(source.ical_url);
  } catch (err) {
    return {
      eventsFound: 0,
      assignmentsCreated: 0,
      assignmentsSkipped: 0,
      conflictCount: 0,
      conflicts: [],
      error: `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Anchor DATE-only iCal events to the property's local timezone if set,
  // otherwise fall back to the app default (America/New_York).
  const { data: propertyTz } = await supabase
    .from("properties")
    .select("timezone")
    .eq("id", input.propertyId)
    .maybeSingle();
  const timeZone =
    (propertyTz?.timezone as string | null | undefined) ?? DEFAULT_TIMEZONE;

  const candidates = parseIcal(rawIcal, { timeZone });

  let created = 0;
  let skipped = 0;
  const conflicts: ConflictWarning[] = [];

  for (const candidate of candidates) {
    try {
      const result = await importCandidate(supabase, input, candidate);
      if (result.created) {
        created++;
      } else {
        skipped++;
      }
      if (result.conflict) {
        conflicts.push(result.conflict);
      }
    } catch {
      skipped++;
    }
  }

  // Update last_synced_at
  await supabase
    .from("property_calendar_sources")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", input.calendarSourceId);

  // Write sync log
  await supabase.from("calendar_sync_logs").insert({
    calendar_source_id: input.calendarSourceId,
    owner_id: input.ownerId,
    property_id: input.propertyId,
    result: conflicts.length > 0 ? "partial" : "success",
    events_found: candidates.length,
    assignments_created: created,
    assignments_skipped: skipped,
    conflict_count: conflicts.length,
    error_message: null,
  });

  return {
    eventsFound: candidates.length,
    assignmentsCreated: created,
    assignmentsSkipped: skipped,
    conflictCount: conflicts.length,
    conflicts,
  };
}
