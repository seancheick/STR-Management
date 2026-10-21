import "server-only";
import { reservationChannel } from "@/lib/reservations/channel";

import { parseIcal, type TurnoverCandidate } from "./parser";
import { DEFAULT_TIMEZONE, formatInTimeZone, zonedDayTime } from "./timezone";
import { shouldImportTurnover, nextArrivalAfterCheckout } from "@/lib/services/calendar-sync-policy";
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

type Platform = "airbnb" | "vrbo" | "booking" | "hostex" | "other";

function detectPlatform(url: string): Platform {
  const u = url.toLowerCase();
  if (u.includes("airbnb.com")) return "airbnb";
  if (u.includes("vrbo.com") || u.includes("homeaway.com")) return "vrbo";
  if (u.includes("booking.com")) return "booking";
  if (u.includes("hostex.io")) return "hostex";
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
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/calendar,*/*" },
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
  const { count, error } = await supabase
    .from("assignments")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("property_id", propertyId)
    .not("status", "in", '("cancelled","needs_reclean")')
    .gte("due_at", windowStart)
    .lte("due_at", windowEnd);

  if (error) throw new Error(error.message);
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
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("default_cleaner_id")
    .eq("id", propertyId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);
  if (!property?.default_cleaner_id) return false;

  const windowStart = new Date(new Date(dueAt).getTime() - 2 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(dueAt).getTime() + 2 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("assignments")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("cleaner_id", property.default_cleaner_id)
    .not("status", "in", '("cancelled","needs_reclean")')
    .gte("due_at", windowStart)
    .lte("due_at", windowEnd);

  if (error) throw new Error(error.message);
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
  context: { timeZone: string; defaultCleanerId: string | null; fixedPayoutAmount: number | null; listingPropertyId: string; platform: string; now: Date },
): Promise<{ created: boolean; conflict: ConflictWarning | null }> {
  const sourceRef = sourceReferenceFor(candidate.uid);

  // Check if already imported
  const { data: existing, error: existingError } = await supabase
    .from("assignments")
    .select("id")
    .eq("owner_id", input.ownerId)
    .eq("property_id", input.propertyId)
    .eq("source_reference", sourceRef)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) {
    return { created: false, conflict: null };
  }

  // Different platforms use different UIDs for the same stay. A cleaning is
  // owned by the property and local checkout day, including completed/manual jobs.
  const dayStart = zonedDayTime(new Date(candidate.checkoutAt), 0, 0, context.timeZone).toISOString();
  const dayEnd = zonedDayTime(new Date(candidate.checkoutAt), 1, 0, context.timeZone).toISOString();
  const { data: sameDay, error: dayError } = await supabase
    .from("assignments")
    .select("status")
    .eq("owner_id", input.ownerId)
    .eq("property_id", input.propertyId)
    .eq("assignment_type", "cleaning")
    .or(`and(checkout_at.gte.${dayStart},checkout_at.lt.${dayEnd}),and(checkout_at.is.null,due_at.gte.${dayStart},due_at.lt.${dayEnd})`);
  if (dayError) throw new Error(dayError.message);
  if (!shouldImportTurnover(candidate, sameDay ?? [], context.now)) {
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

  let cleanerId=context.defaultCleanerId;
  let noAccess=false;
  if(cleanerId){
    const {data:person,error:personError}=await supabase.from("cleaners").select("user_id").eq("id",cleanerId).eq("owner_id",input.ownerId).eq("role","cleaner").eq("active",true).maybeSingle();
    if(personError)throw new Error(personError.message);
    if(!person)cleanerId=null;else noAccess=person.user_id===null;
  }
  // Insert regardless of conflict (conflict is surfaced as a warning, not a blocker)
  const { error } = await supabase.from("assignments").insert({
    owner_id: input.ownerId,
    property_id: input.propertyId,
    listing_property_id: context.listingPropertyId,
    booking_channel: reservationChannel(context.platform, candidate.summary, candidate.description),
    cleaner_id: cleanerId,
    assignment_type: "cleaning",
    fixed_payout_amount: context.fixedPayoutAmount,
    status: cleanerId ? noAccess?"confirmed":"assigned" : "unassigned",
    ack_status: noAccess?"accepted":"pending",
    accepted_at:noAccess?new Date().toISOString():null,
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
    const { data: templateItems, error: templateError } = await supabase
      .from("checklist_template_items")
      .select("id, section_name, label, instruction_text, reference_media_url, required, photo_category, sort_order")
      .eq("template_id", input.primaryChecklistTemplateId)
      .order("sort_order");

    if (templateError) throw new Error(templateError.message);
    if (templateItems?.length) {
      // Get the just-created assignment id
      const { data: newAssignment, error: assignmentReadError } = await supabase
        .from("assignments")
        .select("id")
        .eq("property_id", input.propertyId)
        .eq("source_reference", sourceRef)
        .maybeSingle();

      if (assignmentReadError) throw new Error(assignmentReadError.message);
      if (newAssignment) {
        const { error: checklistError } = await supabase.from("assignment_checklist_items").insert(
          templateItems.map((item) => ({
            assignment_id: newAssignment.id,
            template_item_id: item.id,
            section_name: item.section_name,
            label: item.label,
            instruction_text: item.instruction_text ?? null,
            reference_media_url: item.reference_media_url ?? null,
            required: item.required,
            photo_category: item.photo_category,
            sort_order: item.sort_order,
          })),
        );
        if (checklistError) throw new Error(checklistError.message);
      }
    }
  }

  return { created: true, conflict };
}

export async function syncCalendarSource(input: SyncSourceInput): Promise<SyncResult> {
  const supabase = createServiceSupabaseClient();

  const listingPropertyId = input.propertyId;

  // Fetch the source record for the URL
  const { data: source } = await supabase
    .from("property_calendar_sources")
    .select("ical_url, platform, active")
    .eq("id", input.calendarSourceId)
    .eq("owner_id", input.ownerId)
    .eq("property_id", input.propertyId)
    .maybeSingle();

  if (!source || !source.active) {
    return failedSync("Calendar source not found.");
  }

  const platform = source.platform ?? detectPlatform(source.ical_url);

  let rawIcal: string;
  try {
    rawIcal = await fetchIcal(source.ical_url);
  } catch (err) {
    return failedSync(`Fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // A truncated or HTML error page would parse as "no bookings" and cancel
  // every upcoming job. Only reconcile against a real calendar document.
  if (!/BEGIN:VCALENDAR/i.test(rawIcal) || !/END:VCALENDAR/i.test(rawIcal)) {
    return failedSync("Fetch error: response was not an iCal calendar.");
  }

  // Anchor DATE-only iCal events to the property's local timezone if set,
  // otherwise fall back to the app default (America/New_York).
  const { data: listingProperty, error: listingError } = await supabase
    .from("properties")
    .select("timezone, name, default_cleaner_id, default_clean_price, physical_unit_id")
    .eq("id", input.propertyId)
    .eq("owner_id", input.ownerId)
    .maybeSingle();
  if (listingError || !listingProperty) return failedSync("Property not found.");
  // Multiple listing configurations may sell the same physical floor. Both
  // their reservation records and cleaning jobs belong to that shared unit.
  let propertyTz = listingProperty;
  if (listingProperty.physical_unit_id) {
    const { data: physicalProperty, error: physicalError } = await supabase
      .from("properties")
      .select("timezone, name, default_cleaner_id, default_clean_price, physical_unit_id")
      .eq("id", listingProperty.physical_unit_id)
      .eq("owner_id", input.ownerId)
      .maybeSingle();
    if (physicalError || !physicalProperty) return failedSync("Physical unit not found.");
    propertyTz = physicalProperty;
    input = { ...input, propertyId: listingProperty.physical_unit_id };
  }
  const timeZone =
    (propertyTz?.timezone as string | null | undefined) ?? DEFAULT_TIMEZONE;

  let candidates: TurnoverCandidate[];
  try {
    candidates = parseIcal(rawIcal, { timeZone });
  } catch (err) {
    return failedSync(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
  }

  let created = 0;
  let skipped = 0;
  let reservationsUpserted = 0;
  const conflicts: ConflictWarning[] = [];
  const syncErrors: string[] = [];

  // Upsert full reservation rows so the calendar can draw multi-day booking stripes.
  if (candidates.length > 0) {
    const reservationRows = candidates.map((c) => ({
      owner_id: input.ownerId,
      property_id: input.propertyId,
      listing_property_id: listingPropertyId,
      source_type: "ical",
      source_reference: sourceReferenceFor(c.uid),
      calendar_source_id: input.calendarSourceId,
      platform: reservationChannel(platform, c.summary, c.description),
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
    } else {
      syncErrors.push(`Reservation import failed: ${resError.message}`);
    }
  }

  // Lifecycle problems must not block importing new bookings.
  const lifecycle = await reconcileWithFeed(supabase, input, candidates, {
    propertyName: (propertyTz?.name as string | null | undefined) ?? "A property",
    timeZone,
  }).catch((err) => {
    console.error("[syncCalendarSource] reconcile", input.calendarSourceId, err);
    syncErrors.push(`Reconciliation failed: ${err instanceof Error ? err.message : String(err)}`);
    return { rescheduled: 0, cancelled: 0 };
  });

  // Build next-arrival metadata across every active listing of this physical unit.
  const { data: activeReservations, error: arrivalError } = await supabase
    .from("reservations")
    .select("start_at, calendar_source:property_calendar_sources!inner(active)")
    .eq("owner_id", input.ownerId)
    .eq("property_id", input.propertyId)
    .eq("calendar_source.active", true)
    .gte("end_at", new Date().toISOString())
    .order("start_at");
  const arrivalStarts = (activeReservations ?? []).map((reservation) => reservation.start_at as string);
  if (arrivalError) syncErrors.push(`Next arrival lookup failed: ${arrivalError.message}`);
  else for (const candidate of candidates) {
    candidate.nextCheckinAt = nextArrivalAfterCheckout(candidate.checkoutAt, arrivalStarts);
  }

  for (const candidate of candidates) {
    try {
      const result = await importCandidate(supabase, input, candidate, {
        timeZone,
        defaultCleanerId: propertyTz?.default_cleaner_id ?? null,
        fixedPayoutAmount: listingProperty.default_clean_price ?? null,
        listingPropertyId,
        platform,
        now: new Date(),
      });
      if (result.created) {
        created++;
      } else {
        skipped++;
      }
      if (result.conflict) {
        conflicts.push(result.conflict);
      }
    } catch (err) {
      skipped++;
      syncErrors.push(`Cleaning import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!arrivalError) {
    const { data: liveJobs, error: liveError } = await supabase
      .from("assignments")
      .select("id, checkout_at")
      .eq("owner_id", input.ownerId)
      .eq("property_id", input.propertyId)
      .eq("source_type", "ical")
      .in("status", [...SYNC_MUTABLE_STATUSES])
      .gt("due_at", new Date().toISOString());
    if (liveError) syncErrors.push(`Live turnover lookup failed: ${liveError.message}`);
    for (const job of liveJobs ?? []) {
      if (!job.checkout_at) continue;
      const { error: nextError } = await supabase
        .from("assignments")
        .update({ next_checkin_at: nextArrivalAfterCheckout(job.checkout_at, arrivalStarts) })
        .eq("id", job.id)
        .in("status", [...SYNC_MUTABLE_STATUSES]);
      if (nextError) syncErrors.push(`Next arrival update failed: ${nextError.message}`);
    }
  }

  // Update last_synced_at
  const { error: syncStampError } = await supabase
    .from("property_calendar_sources")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", input.calendarSourceId);

  if (syncStampError) syncErrors.push(`Sync timestamp failed: ${syncStampError.message}`);

  // Write sync log
  const { error: logError } = await supabase.from("calendar_sync_logs").insert({
    calendar_source_id: input.calendarSourceId,
    owner_id: input.ownerId,
    property_id: input.propertyId,
    result: conflicts.length > 0 || syncErrors.length > 0 ? "partial" : "success",
    events_found: candidates.length,
    assignments_created: created,
    assignments_skipped: skipped,
    conflict_count: conflicts.length,
    error_message: syncErrors.length > 0 ? [...new Set(syncErrors)].join("; ") : null,
  });

  if (logError) syncErrors.push(`Sync log failed: ${logError.message}`);

  return {
    eventsFound: candidates.length,
    assignmentsCreated: created,
    assignmentsSkipped: skipped,
    assignmentsRescheduled: lifecycle.rescheduled,
    assignmentsCancelled: lifecycle.cancelled,
    reservationsUpserted,
    conflictCount: conflicts.length,
    conflicts,
    ...(syncErrors.length > 0 ? { error: [...new Set(syncErrors)].join("; ") } : {}),
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
    .eq("assignment_type", "cleaning")
    .or(`checkout_at.gte.${zonedDayTime(now, 0, 0, context.timeZone).toISOString()},due_at.gte.${zonedDayTime(now, 0, 0, context.timeZone).toISOString()}`);
  if (error) throw new Error(error.message);

  const { data: otherReservations, error: otherError } = await supabase
    .from("reservations")
    .select("end_at, calendar_source_id, source_reference, listing_property_id, calendar_source:property_calendar_sources!inner(active, property_id, listing:properties(default_clean_price))")
    .eq("owner_id", input.ownerId)
    .eq("property_id", input.propertyId)
    .eq("calendar_source.active", true)
    .neq("calendar_source_id", input.calendarSourceId)
    .gte("end_at", zonedDayTime(now, 0, 0, context.timeZone).toISOString());
  if (otherError) throw new Error(otherError.message);

  const plan = planReconciliation({
    existing: (existing ?? []) as ImportedAssignment[],
    candidates,
    calendarSourceId: input.calendarSourceId,
    now,
    timeZone: context.timeZone,
    otherFeedReservations: (otherReservations ?? []).map((reservation) => ({
      checkoutAt: reservation.end_at,
      calendarSourceId: reservation.calendar_source_id,
      sourceReference: reservation.source_reference,
      listingPropertyId: reservation.listing_property_id ?? (reservation.calendar_source as unknown as { property_id: string }).property_id,
      fixedPayoutAmount: (reservation.calendar_source as unknown as { listing: { default_clean_price: number | null } }).listing?.default_clean_price ?? null,
    })),
  });

  if (plan.stampSourceIds.length > 0) {
    const { error: stampError } = await supabase
      .from("assignments")
      .update({ calendar_source_id: input.calendarSourceId })
      .in("id", plan.stampSourceIds)
      .is("calendar_source_id", null);
    if (stampError) throw new Error(stampError.message);
  }

  for (const transfer of plan.ownershipTransfers) {
    const { error: transferError } = await supabase
      .from("assignments")
      .update({ calendar_source_id: transfer.calendarSourceId, source_reference: transfer.sourceReference })
      .eq("id", transfer.id)
      .eq("owner_id", input.ownerId)
      .eq("calendar_source_id", input.calendarSourceId)
      .in("status", [...SYNC_MUTABLE_STATUSES]);
    if (transferError) throw new Error(transferError.message);
    // Source ownership may move between equivalent feeds, but an explicit
    // host correction owns actual scope/pay. The predicate is checked by the
    // database at update time, including a correction racing this sync.
    const { error: priceError } = await supabase.from("assignments")
      .update({ fixed_payout_amount: transfer.fixedPayoutAmount, listing_property_id: transfer.listingPropertyId })
      .eq("id", transfer.id).eq("owner_id", input.ownerId)
      .eq("calendar_source_id", transfer.calendarSourceId)
      .is("cleaning_scope_property_id", null)
      .in("status", [...SYNC_MUTABLE_STATUSES]);
    if (priceError) throw new Error(priceError.message);

  }

  const when = (iso: string) =>
    formatInTimeZone(iso, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, context.timeZone);

  let rescheduled = 0;
  for (const update of plan.updates) {
    if (update.dueChanged) {
      const start = zonedDayTime(new Date(update.patch.checkout_at), 0, 0, context.timeZone).toISOString();
      const end = zonedDayTime(new Date(update.patch.checkout_at), 1, 0, context.timeZone).toISOString();
      const { count, error: collisionError } = await supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", input.ownerId)
        .eq("property_id", input.propertyId)
        .eq("assignment_type", "cleaning")
        .neq("id", update.id)
        .neq("status", "cancelled")
        .or(`and(checkout_at.gte.${start},checkout_at.lt.${end}),and(checkout_at.is.null,due_at.gte.${start},due_at.lt.${end})`);
      if (collisionError) throw new Error(collisionError.message);
      // Preserve the canonical cleaning already occupying the new turnover day.
      if (count) {
        // The destination already has its canonical job; the old-day job is
        // obsolete and must no longer remain actionable.
        plan.cancels.push({ id: update.id, cleanerId: update.cleanerId, dueAt: update.previousDueAt });
        continue;
      }
    }
    // Status guard: a cleaner may have started the job since we read it.
    const { data: moved, error: moveError } = await supabase
      .from("assignments")
      .update(update.patch)
      .eq("id", update.id)
      .in("status", [...SYNC_MUTABLE_STATUSES])
      .select("id");
    if (moveError) throw new Error(moveError.message);
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
    const { data: done, error: cancelError } = await supabase
      .from("assignments")
      .update({ status: "cancelled" })
      .eq("id", job.id)
      .in("status", [...SYNC_MUTABLE_STATUSES])
      .select("id");
    if (cancelError) throw new Error(cancelError.message);
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
  const { data: futureReservations, error: reservationReadError } = await supabase
    .from("reservations")
    .select("id, source_reference")
    .eq("calendar_source_id", input.calendarSourceId)
    .gt("start_at", now.toISOString());
  if (reservationReadError) throw new Error(reservationReadError.message);
  const vanished = (futureReservations ?? [])
    .filter((r) => !feedRefs.has(r.source_reference as string))
    .map((r) => r.id as string);
  if (vanished.length > 0) {
    const { error: deleteError } = await supabase.from("reservations").delete().in("id", vanished);
    if (deleteError) throw new Error(deleteError.message);
  }

  return { rescheduled, cancelled };
}
