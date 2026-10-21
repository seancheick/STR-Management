import "server-only";

import { getProperties, getReservations } from "./client";
import { planHostexReconciliation, hostexSourceReference, type HostexListing, type HostexPlan, type HostexPlanJob } from "./reservation-plan";
import { SYNC_MUTABLE_STATUSES } from "@/lib/ical/reconcile";
import { DEFAULT_TIMEZONE, dateKeyInTimeZone, formatInTimeZone } from "@/lib/ical/timezone";
import { sendNotification } from "@/lib/notifications/notification-service";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type HostexSyncResult = { ok: boolean; dryRun: boolean; summary: HostexPlan["summary"] | null; plan?: HostexPlan; error?: string };

const DAY = 86_400_000;
// Matches the 180-day check-out range one GET /reservations request may cover.
const WINDOW_DAYS = 180;

/**
 * Reconciles cleaning jobs with Hostex reservations. Every Hostex call is a
 * read. Any Hostex or database failure returns ok:false and leaves the iCal
 * sync's work as it is; this function never throws.
 */
export async function syncHostexReservations(options: { dryRun?: boolean; now?: Date } = {}): Promise<HostexSyncResult> {
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date();
  if (!process.env.HOSTEX_API_TOKEN) return { ok: false, dryRun, summary: null, error: "Hostex is not configured; iCal feeds remain in effect." };
  try {
    const supabase = createServiceSupabaseClient();
    const start = dateKeyInTimeZone(new Date(now.getTime() - DAY), DEFAULT_TIMEZONE);
    const end = new Date(Date.parse(`${start}T00:00:00Z`) + (WINDOW_DAYS - 1) * DAY).toISOString().slice(0, 10);

    let tokenProperties: Awaited<ReturnType<typeof getProperties>>;
    let stays: Awaited<ReturnType<typeof getReservations>>;
    try {
      tokenProperties = await getProperties();
      stays = await getReservations(start, end);
    } catch (err) {
      console.error("[syncHostexReservations] Hostex read failed", err);
      return { ok: false, dryRun, summary: null, error: "Hostex is unavailable; iCal feeds remain in effect." };
    }

    const { data: listingRows, error: listingError } = await supabase.from("properties")
      .select("id, owner_id, hostex_property_id, physical_unit_id, default_clean_price, primary_checklist_template_id")
      .not("hostex_property_id", "is", null).eq("active", true);
    if (listingError) throw new Error(listingError.message);
    const unitIds = [...new Set((listingRows ?? []).map((l) => l.physical_unit_id ?? l.id))];
    const { data: unitRows, error: unitError } = unitIds.length
      ? await supabase.from("properties").select("id, owner_id, name, timezone, default_cleaner_id").in("id", unitIds)
      : { data: [], error: null };
    if (unitError) throw new Error(unitError.message);
    const units = new Map((unitRows ?? []).map((u) => [u.id as string, u]));
    const listingInfo = new Map((listingRows ?? []).map((l) => [l.id as string, l]));
    const listings: HostexListing[] = (listingRows ?? []).flatMap((l) => {
      const unit = units.get(l.physical_unit_id ?? l.id);
      // A unit belonging to another owner is not this tenant's to clean.
      if (!unit || unit.owner_id !== l.owner_id) return [];
      return [{ id: l.id, ownerId: l.owner_id, hostexPropertyId: Number(l.hostex_property_id), unitId: unit.id, timeZone: unit.timezone ?? DEFAULT_TIMEZONE }];
    });
    const owners = [...new Set(listings.map((l) => l.ownerId))];

    const jobs: HostexPlanJob[] = [];
    const cutoffs: Record<string, string> = {};
    if (owners.length) {
      const since = new Date(Date.parse(`${start}T00:00:00Z`) - DAY).toISOString();
      const { data: jobRows, error: jobError } = await supabase.from("assignments")
        .select("id, owner_id, property_id, status, source_type, checkout_at, due_at, cleaner_id, hostex_reservation_code, booking_channel, reservation_cancelled_at, paid_at, ledger_entry_id")
        .in("owner_id", owners).in("property_id", [...new Set(listings.map((l) => l.unitId))]).eq("assignment_type", "cleaning")
        .or(`checkout_at.gte.${since},and(checkout_at.is.null,due_at.gte.${since})`);
      if (jobError) throw new Error(jobError.message);
      const ids = (jobRows ?? []).map((j) => j.id as string);
      const { data: payoutRows, error: payoutError } = ids.length
        ? await supabase.from("payout_entries").select("assignment_id").in("assignment_id", ids)
        : { data: [], error: null };
      if (payoutError) throw new Error(payoutError.message);
      const { data: accounts, error: accountError } = await supabase.from("cleaner_accounts").select("owner_id, cleaner_id, reconciled_through").in("owner_id", owners);
      if (accountError) throw new Error(accountError.message);
      for (const a of accounts ?? []) if (!cutoffs[a.owner_id] || a.reconciled_through > cutoffs[a.owner_id]) cutoffs[a.owner_id] = a.reconciled_through;
      const reported = new Set((payoutRows ?? []).map((p) => p.assignment_id as string));
      for (const j of jobRows ?? []) {
        const zone = units.get(j.property_id)?.timezone ?? DEFAULT_TIMEZONE;
        const reconciled = (accounts ?? []).some((a) => a.owner_id === j.owner_id && a.cleaner_id === j.cleaner_id &&
          dateKeyInTimeZone(new Date(j.checkout_at ?? j.due_at), zone) <= a.reconciled_through);
        jobs.push({ id: j.id, ownerId: j.owner_id, propertyId: j.property_id, status: j.status, sourceType: j.source_type,
          checkoutAt: j.checkout_at, dueAt: j.due_at, cleanerId: j.cleaner_id, hostexReservationCode: j.hostex_reservation_code,
          bookingChannel: j.booking_channel, reservationCancelledAt: j.reservation_cancelled_at,
          locked: j.paid_at !== null || j.ledger_entry_id !== null || reported.has(j.id) || reconciled });
      }
    }

    const plan = planHostexReconciliation({ stays, tokenPropertyIds: tokenProperties.map((p) => p.id), listings, jobs, cutoffs, now });
    if (dryRun) return { ok: true, dryRun, summary: plan.summary, plan };

    const errors: string[] = [];
    const step = async (label: string, run: () => Promise<void>) => {
      try { await run(); } catch (err) { errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`); }
    };
    const unitName = (id: string) => (units.get(id)?.name as string | undefined) ?? "A property";
    const when = (iso: string, unitId: string) => formatInTimeZone(iso, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, units.get(unitId)?.timezone ?? DEFAULT_TIMEZONE);
    const jobUnit = new Map(jobs.map((j) => [j.id, j.propertyId]));
    const pending = [...SYNC_MUTABLE_STATUSES];

    if (plan.reservations.length) await step("Reservation import", async () => {
      const { error } = await supabase.from("reservations").upsert(plan.reservations, { onConflict: "property_id,source_reference" });
      if (error) throw new Error(error.message);
    });
    for (const removed of plan.removedReservations) await step("Reservation removal", async () => {
      const { error } = await supabase.from("reservations").delete().eq("owner_id", removed.ownerId).eq("source_type", "hostex").eq("source_reference", removed.sourceReference);
      if (error) throw new Error(error.message);
    });

    for (const link of plan.links) await step("Job link", async () => {
      const { error } = await supabase.from("assignments").update(link.patch).eq("id", link.jobId).eq("owner_id", link.ownerId)
        .or(`hostex_reservation_code.is.null,hostex_reservation_code.eq."${link.code}"`).is("paid_at", null).is("ledger_entry_id", null);
      if (error) throw new Error(error.message);
    });

    for (const move of plan.moves) await step("Job move", async () => {
      const { data, error } = await supabase.from("assignments").update(move.patch).eq("id", move.jobId).eq("owner_id", move.ownerId)
        .in("status", pending).is("paid_at", null).is("ledger_entry_id", null).select("id");
      if (error) throw new Error(error.message);
      const unitId = jobUnit.get(move.jobId)!;
      if (data?.length && move.cleanerId) await sendNotification({ ownerId: move.ownerId, recipientId: move.cleanerId, assignmentId: move.jobId,
        type: "assignment_rescheduled", title: "Job moved", url: `/jobs/${move.jobId}`,
        body: `${unitName(unitId)} moved from ${when(move.previousDueAt, unitId)} to ${when(move.patch.due_at, unitId)}. The guest changed their booking.` });
    });

    const cleaners = new Map<string, { id: string | null; noAccess: boolean }>();
    for (const job of plan.creates) await step("Cleaning import", async () => {
      const unit = units.get(job.unitId)!;
      const listing = listingInfo.get(job.listingId)!;
      // Same default-cleaner rules as the iCal import: only an active cleaner of this owner.
      if (!cleaners.has(job.unitId)) {
        let cleaner = { id: (unit.default_cleaner_id as string | null) ?? null, noAccess: false };
        if (cleaner.id) {
          const { data: person, error } = await supabase.from("cleaners").select("user_id").eq("id", cleaner.id).eq("owner_id", job.ownerId).eq("role", "cleaner").eq("active", true).maybeSingle();
          if (error) throw new Error(error.message);
          cleaner = person ? { id: cleaner.id, noAccess: person.user_id === null } : { id: null, noAccess: false };
        }
        cleaners.set(job.unitId, cleaner);
      }
      const cleaner = cleaners.get(job.unitId)!;
      const { data: created, error } = await supabase.from("assignments").insert({
        owner_id: job.ownerId, property_id: job.unitId, listing_property_id: job.listingId, booking_channel: job.channel,
        cleaner_id: cleaner.id, assignment_type: "cleaning", fixed_payout_amount: listing.default_clean_price ?? null,
        status: cleaner.id ? (cleaner.noAccess ? "confirmed" : "assigned") : "unassigned",
        ack_status: cleaner.noAccess ? "accepted" : "pending", accepted_at: cleaner.noAccess ? new Date().toISOString() : null,
        priority: "normal", checkout_at: job.checkoutAt, due_at: job.dueAt, next_checkin_at: job.nextCheckinAt,
        source_type: "hostex", source_reference: hostexSourceReference(job.stayCode), hostex_reservation_code: job.code,
        calendar_source_id: null, created_by_user_id: job.ownerId,
      }).select("id").maybeSingle();
      if (error) { if (error.code === "23505") return; throw new Error(error.message); }
      const templateId = listing.primary_checklist_template_id as string | null;
      if (!created || !templateId) return;
      const { data: items, error: templateError } = await supabase.from("checklist_template_items")
        .select("id, section_name, label, instruction_text, reference_media_url, required, photo_category, sort_order")
        .eq("template_id", templateId).order("sort_order");
      if (templateError) throw new Error(templateError.message);
      if (!items?.length) return;
      const { error: checklistError } = await supabase.from("assignment_checklist_items").insert(items.map((item) => ({
        assignment_id: created.id, template_item_id: item.id, section_name: item.section_name, label: item.label,
        instruction_text: item.instruction_text ?? null, reference_media_url: item.reference_media_url ?? null,
        required: item.required, photo_category: item.photo_category, sort_order: item.sort_order,
      })));
      if (checklistError) throw new Error(checklistError.message);
    });

    for (const job of plan.cancels) await step("Job cancellation", async () => {
      const cutoff = new Date().toISOString();
      const { data, error } = await supabase.from("assignments").update({ status: "cancelled" }).eq("id", job.jobId).eq("owner_id", job.ownerId)
        .in("status", pending).is("paid_at", null).is("ledger_entry_id", null)
        .or(`checkout_at.gt.${cutoff},and(checkout_at.is.null,due_at.gt.${cutoff})`).select("id");
      if (error) throw new Error(error.message);
      const unitId = jobUnit.get(job.jobId)!;
      if (data?.length && job.cleanerId) await sendNotification({ ownerId: job.ownerId, recipientId: job.cleanerId, assignmentId: job.jobId,
        type: "assignment_cancelled", title: "Job cancelled", url: "/jobs",
        body: `${unitName(unitId)} on ${when(job.dueAt, unitId)} is cancelled. The guest cancelled the booking.` });
    });

    for (const flag of plan.flags) await step("Cancellation flag", async () => {
      // Only the marker is written; status, pay and evidence stay as they are.
      const { data, error } = await supabase.from("assignments").update({ reservation_cancelled_at: new Date().toISOString() })
        .eq("id", flag.jobId).eq("owner_id", flag.ownerId).is("reservation_cancelled_at", null).select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) return;
      const { error: issueError } = await supabase.from("issues").insert({ owner_id: flag.ownerId, assignment_id: flag.jobId, property_id: flag.propertyId,
        issue_type: "other", severity: "high", title: "Booking cancelled after the cleaning was started",
        description: `Hostex reports reservation ${flag.code} as cancelled. The job was not changed automatically; review it before paying.` });
      if (issueError) throw new Error(issueError.message);
    });

    return { ok: errors.length === 0, dryRun, summary: plan.summary, ...(errors.length ? { error: [...new Set(errors)].join("; ") } : {}) };
  } catch (err) {
    console.error("[syncHostexReservations]", err);
    return { ok: false, dryRun, summary: null, error: "Hostex reservation sync failed; iCal feeds remain in effect." };
  }
}
