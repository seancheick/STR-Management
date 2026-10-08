import "server-only";

import { parseIcal, type TurnoverCandidate } from "./parser";
import { DEFAULT_TIMEZONE, formatInTimeZone } from "./timezone";
import { assertPublicHttpsUrl } from "./url-guard";
import {
  planReconciliation,
  sourceReferenceFor,
  SYNC_MUTABLE_STATUSES,
  type ImportedAssignment,
} from "./reconcile";
import { sendNotification } from "@/lib/notifications/notification-service";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

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
  /** Upcoming jobs whose booking dates changed in the feed. */
  assignmentsRescheduled: number;
  /** Upcoming jobs cancelled because their booking left the feed. */
  assignmentsCancelled: number;
  reservationsUpserted: number;
  conflictCount: number;
  conflicts: ConflictWarning[];
  error?: string;
};

type Platform = "airbnb" | "vrbo" | "booking" | "other";

function detectPlatform(url: string): Platform {
  const u = url.toLowerCase();
  if (u.includes("airbnb.com")) return "airbnb";
  if (u.includes("vrbo.com") || u.includes("homeaway.com")) return "vrbo";
  if (u.includes("booking.com")) return "booking";
  return "other";
}

function extractGuestName(summary: string | null): string | null {
  if (!summary) return null;
  // Airbnb summaries look like "Reserved - CODEABC" or "Guest Name (phone)".
  // Strip any leading "Reserved - " / "Booked - " marker.
  const cleaned = summary.replace(/^(reserved|booked|booking|guest booking)\s*[-–:]\s*/i, "").trim();
  return cleaned.length > 0 && cleaned.length < 120 ? cleaned : null;
}

export type ConflictWarning = {
  uid: string;
  dueAt: string;
  reason: "overlap" | "cleaner_overload";
  details: string;
};

const MAX_ICAL_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/**
 * Fetch raw iCal text from a user-supplied URL. Every hop (including
 * redirects) must pass the public-https guard, and the body is capped.
 */
async function fetchIcal(url: string): Promise<string> {
  const signal = AbortSignal.timeout(10_000);
  let target = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttpsUrl(target);
    const res = await fetch(target, {
      headers: { "User-Agent": "AirbnbOpsPortal/1.0" },
      redirect: "manual",
      signal,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`iCal fetch failed: redirect without location`);
      target = new URL(location, target).toString();
      continue;
    }
    if (!res.ok) {
      throw new Error(`iCal fetch failed: ${res.status} ${res.statusText}`);
    }
    return readCapped(res, MAX_ICAL_BYTES);
  }
  throw new Error("iCal fetch failed: too many redirects");
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("iCal fetch failed: calendar file is too large");
  if (!res.body) return "";

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("iCal fetch failed: calendar file is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Check for overlapping assignments at the same property within ±4 hours of dueAt.
 */
async function detectOverlap(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  ownerId: string,
  propertyId: string,
  dueAt: string,
): Promise<boolean> {
  const windowStart = new Date(new Date(dueAt).getTime() - 4 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(dueAt).getTime() + 4 * 60 * 60 * 1000).toISOString();

  // Tenant-scope explicitly. The service-role client bypasses RLS, and
  // property_id alone could collide if a future migration ever shares IDs.
  const { count } = await supabase
    .from("assignments")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
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
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  ownerId: string,
  propertyId: string,
  dueAt: string,
): Promise<boolean> {
  // Get default_cleaner_id — scoped by owner so we can't accidentally read
  // a different tenant's property if id collisions ever happen.
  const { data: property } = await supabase
    .from("properties")
    .select("default_cleaner_id")
    .eq("id", propertyId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!property?.default_cleaner_id) return false;

  const windowStart = new Date(new Date(dueAt).getTime() - 2 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(dueAt).getTime() + 2 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("assignments")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
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
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  input: SyncSourceInput,
  candidate: TurnoverCandidate,
): Promise<{ created: boolean; conflict: ConflictWarning | null }> {
  const sourceRef = sourceReferenceFor(candidate.uid);

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
    detectOverlap(supabase, input.ownerId, input.propertyId, candidate.dueAt),
    detectCleanerOverload(supabase, input.ownerId, input.propertyId, candidate.dueAt),
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
    next_checkin_at: candidate.nextCheckinAt,
    source_type: "ical",
    source_reference: sourceRef,
    calendar_source_id: input.calendarSourceId,
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
  const supabase = createServiceSupabaseClient();

  // Fetch the source record for the URL
  const { data: source } = await supabase
    .from("property_calendar_sources")
    .select("ical_url")
    .eq("id", input.calendarSourceId)
    .maybeSingle();

  if (!source) {
    return failedSync("Calendar source not found.");
  }

  const platform = detectPlatform(source.ical_url);

  let rawIcal: string;
  try {
    rawIcal = await fetchIcal(source.ical_url);
  } catch (err) {
    return failedSync(`Fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // A truncated or HTML error page would parse as "no bookings" and cancel
  // every upcoming job. Only reconcile against a real calendar document.
  if (!/BEGIN:VCALENDAR/i.test(rawIcal)) {
    return failedSync("Fetch error: response was not an iCal calendar.");
  }

  // Anchor DATE-only iCal events to the property's local timezone if set,
  // otherwise fall back to the app default (America/New_York).
  const { data: propertyTz } = await supabase
    .from("properties")
    .select("timezone, name")
    .eq("id", input.propertyId)
    .maybeSingle();
  const timeZone =
    (propertyTz?.timezone as string | null | undefined) ?? DEFAULT_TIMEZONE;

  const candidates = parseIcal(rawIcal, { timeZone });

  let created = 0;
  let skipped = 0;
  let reservationsUpserted = 0;
  const conflicts: ConflictWarning[] = [];

  // Upsert full reservation rows so the calendar can draw multi-day booking stripes.
  if (candidates.length > 0) {
    const reservationRows = candidates.map((c) => ({
      owner_id: input.ownerId,
      property_id: input.propertyId,
      source_type: "ical",
      source_reference: sourceReferenceFor(c.uid),
      calendar_source_id: input.calendarSourceId,
      platform,
      guest_name: extractGuestName(c.summary),
      start_at: c.checkinAt,
      end_at: c.checkoutAt,
      summary: c.summary,
    }));

    const { error: resError, count: resCount } = await supabase
      .from("reservations")
      .upsert(reservationRows, {
        onConflict: "property_id,source_reference",
        count: "exact",
      });

    if (!resError) {
      reservationsUpserted = resCount ?? reservationRows.length;
    }
  }

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

  // Lifecycle problems must not block importing new bookings.
  const lifecycle = await reconcileWithFeed(supabase, input, candidates, {
    propertyName: (propertyTz?.name as string | null | undefined) ?? "A property",
    timeZone,
  }).catch((err) => {
    console.error("[syncCalendarSource] reconcile", input.calendarSourceId, err);
    return { rescheduled: 0, cancelled: 0 };
  });

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
    assignmentsRescheduled: lifecycle.rescheduled,
    assignmentsCancelled: lifecycle.cancelled,
    reservationsUpserted,
    conflictCount: conflicts.length,
    conflicts,
  };
}

function failedSync(error: string): SyncResult {
  return {
    eventsFound: 0,
    assignmentsCreated: 0,
    assignmentsSkipped: 0,
    assignmentsRescheduled: 0,
    assignmentsCancelled: 0,
    reservationsUpserted: 0,
    conflictCount: 0,
    conflicts: [],
    error,
  };
}

/**
 * Makes upcoming imported jobs follow the feed: moved bookings move their
 * cleaning job, bookings that vanished from this source cancel theirs, and
 * the assigned cleaner is told about either. See planReconciliation for the
 * safety rules (unstarted jobs only, this source's jobs only).
 */
async function reconcileWithFeed(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  input: SyncSourceInput,
  candidates: TurnoverCandidate[],
  context: { propertyName: string; timeZone: string },
): Promise<{ rescheduled: number; cancelled: number }> {
  const now = new Date();

  const { data: existing, error } = await supabase
    .from("assignments")
    .select("id, source_reference, status, cleaner_id, calendar_source_id, due_at, checkout_at, next_checkin_at")
    .eq("owner_id", input.ownerId)
    .eq("property_id", input.propertyId)
    .eq("source_type", "ical")
    .in("status", [...SYNC_MUTABLE_STATUSES])
    .gt("due_at", now.toISOString());
  if (error) throw new Error(error.message);

  const plan = planReconciliation({
    existing: (existing ?? []) as ImportedAssignment[],
    candidates,
    calendarSourceId: input.calendarSourceId,
    now,
  });

  if (plan.stampSourceIds.length > 0) {
    await supabase
      .from("assignments")
      .update({ calendar_source_id: input.calendarSourceId })
      .in("id", plan.stampSourceIds)
      .is("calendar_source_id", null);
  }

  const when = (iso: string) =>
    formatInTimeZone(iso, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, context.timeZone);

  let rescheduled = 0;
  for (const update of plan.updates) {
    // Status guard: a cleaner may have started the job since we read it.
    const { data: moved } = await supabase
      .from("assignments")
      .update(update.patch)
      .eq("id", update.id)
      .in("status", [...SYNC_MUTABLE_STATUSES])
      .select("id");
    if (!moved?.length || !update.dueChanged) continue;
    rescheduled++;
    if (update.cleanerId) {
      await sendNotification({
        ownerId: input.ownerId,
        recipientId: update.cleanerId,
        assignmentId: update.id,
        type: "assignment_rescheduled",
        title: "Job moved",
        body: `${context.propertyName} moved from ${when(update.previousDueAt)} to ${when(update.patch.due_at)}. The guest changed their booking.`,
        url: `/jobs/${update.id}`,
      });
    }
  }

  let cancelled = 0;
  for (const job of plan.cancels) {
    const { data: done } = await supabase
      .from("assignments")
      .update({ status: "cancelled" })
      .eq("id", job.id)
      .in("status", [...SYNC_MUTABLE_STATUSES])
      .select("id");
    if (!done?.length) continue;
    cancelled++;
    if (job.cleanerId) {
      await sendNotification({
        ownerId: input.ownerId,
        recipientId: job.cleanerId,
        assignmentId: job.id,
        type: "assignment_cancelled",
        title: "Job cancelled",
        body: `${context.propertyName} on ${when(job.dueAt)} is cancelled. The booking was removed from the calendar.`,
        url: "/jobs",
      });
    }
  }

  // Future reservations from this source that left the feed are gone too.
  // Past stays are kept as history even when the feed stops listing them.
  const feedRefs = new Set(candidates.map((c) => sourceReferenceFor(c.uid)));
  const { data: futureReservations } = await supabase
    .from("reservations")
    .select("id, source_reference")
    .eq("calendar_source_id", input.calendarSourceId)
    .gt("start_at", now.toISOString());
  const vanished = (futureReservations ?? [])
    .filter((r) => !feedRefs.has(r.source_reference as string))
    .map((r) => r.id as string);
  if (vanished.length > 0) {
    await supabase.from("reservations").delete().in("id", vanished);
  }

  return { rescheduled, cancelled };
}
