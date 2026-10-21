import "server-only";

import { getProperties, getReservations } from "./client";
import { planHostexReconciliation, type HostexListing, type HostexPlan, type HostexPlanJob } from "./reservation-plan";
import { DEFAULT_TIMEZONE, dateKeyInTimeZone, formatInTimeZone } from "@/lib/ical/timezone";
import { sendNotification } from "@/lib/notifications/notification-service";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type HostexSyncResult = { ok: boolean; dryRun: boolean; summary: HostexPlan["summary"] | null; plan?: HostexPlan; error?: string };

const DAY = 86_400_000;
// Matches the 180-day check-out range one GET /reservations request may cover.
const WINDOW_DAYS = 180;
const PAGE = 500;
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}
function chunks<T>(rows: T[], size = 100): T[][] {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
}

/**
 * Reconciles cleaning jobs with Hostex reservations. Every Hostex call is a
 * read. Any Hostex or database failure returns ok:false and leaves the iCal
 * sync's work as it is; this function never throws.
 */
export async function syncHostexReservations(options: { dryRun?: boolean; now?: Date; ownerId?: string } = {}): Promise<HostexSyncResult> {
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

    // Owner-scoped imports still check the global mapping for ambiguity. A
    // duplicate Hostex ID must never become valid just because another tenant
    // was hidden by the manual-sync filter.
    const mappingRows = await readAll((from, to) => supabase.from("properties").select("id, hostex_property_id")
      .not("hostex_property_id", "is", null).eq("active", true).order("id").range(from, to));
    const mappingCounts = new Map<number, number>();
    for (const row of mappingRows) mappingCounts.set(Number(row.hostex_property_id), (mappingCounts.get(Number(row.hostex_property_id)) ?? 0) + 1);
    const listingRows = await readAll((from, to) => {
      let query = supabase.from("properties")
        .select("id, owner_id, hostex_property_id, physical_unit_id, default_clean_price, primary_checklist_template_id")
        .not("hostex_property_id", "is", null).eq("active", true);
      if (options.ownerId) query = query.eq("owner_id", options.ownerId);
      return query.order("id").range(from, to);
    });
    const unitIds = [...new Set(listingRows.map((l) => l.physical_unit_id ?? l.id))];
    const unitRows = (await Promise.all(chunks(unitIds).map((ids) => readAll((from, to) => supabase.from("properties")
      .select("id, owner_id, name, timezone, default_cleaner_id").in("id", ids).order("id").range(from, to))))).flat();
    const units = new Map((unitRows ?? []).map((u) => [u.id as string, u]));
    const listings: HostexListing[] = (listingRows ?? []).flatMap((l) => {
      const unit = units.get(l.physical_unit_id ?? l.id);
      // A unit belonging to another owner is not this tenant's to clean.
      if (!unit || unit.owner_id !== l.owner_id || mappingCounts.get(Number(l.hostex_property_id)) !== 1) return [];
      return [{ id: l.id, ownerId: l.owner_id, hostexPropertyId: Number(l.hostex_property_id), unitId: unit.id, timeZone: unit.timezone ?? DEFAULT_TIMEZONE }];
    });
    const owners = [...new Set(listings.map((l) => l.ownerId))];

    const jobs: HostexPlanJob[] = [];
    const cutoffs: Record<string, string> = {};
    if (owners.length) {
      const since = new Date(Date.parse(`${start}T00:00:00Z`) - DAY).toISOString();
      const jobRows = (await Promise.all(chunks([...new Set(listings.map((l) => l.unitId))]).map((ids) => readAll((from, to) => supabase.from("assignments")
        .select("id, owner_id, property_id, status, source_type, checkout_at, due_at, next_checkin_at, cleaner_id, hostex_reservation_code, hostex_stay_code, booking_channel, reservation_cancelled_at, paid_at, ledger_entry_id")
        .in("owner_id", owners).in("property_id", ids).eq("assignment_type", "cleaning")
        .or(`checkout_at.gte.${since},and(checkout_at.is.null,due_at.gte.${since})`).order("id").range(from, to))))).flat();
      const ids = jobRows.map((j) => j.id as string);
      const payoutRows = (await Promise.all(chunks(ids).map((batch) => readAll((from, to) => supabase.from("payout_entries")
        .select("id, assignment_id").in("assignment_id", batch).order("id").range(from, to))))).flat();
      const adjustments = (await Promise.all(chunks(ids).map((batch) => readAll((from, to) => supabase.from("cleaning_pay_adjustments")
        .select("id, assignment_id").in("assignment_id", batch).order("id").range(from, to))))).flat();
      const accounts = await readAll((from, to) => supabase.from("cleaner_accounts").select("owner_id, cleaner_id, reconciled_through")
        .in("owner_id", owners).order("owner_id").order("cleaner_id").range(from, to));
      for (const a of accounts ?? []) if (!cutoffs[a.owner_id] || a.reconciled_through > cutoffs[a.owner_id]) cutoffs[a.owner_id] = a.reconciled_through;
      const reported = new Set([...payoutRows, ...adjustments].map((p) => p.assignment_id as string));
      for (const j of jobRows ?? []) {
        const zone = units.get(j.property_id)?.timezone ?? DEFAULT_TIMEZONE;
        const reconciled = (accounts ?? []).some((a) => a.owner_id === j.owner_id && a.cleaner_id === j.cleaner_id &&
          dateKeyInTimeZone(new Date(j.checkout_at ?? j.due_at), zone) <= a.reconciled_through);
        jobs.push({ id: j.id, ownerId: j.owner_id, propertyId: j.property_id, status: j.status, sourceType: j.source_type,
          checkoutAt: j.checkout_at, dueAt: j.due_at, nextCheckinAt: j.next_checkin_at, hostexStayCode: j.hostex_stay_code, cleanerId: j.cleaner_id, hostexReservationCode: j.hostex_reservation_code,
          bookingChannel: j.booking_channel, reservationCancelledAt: j.reservation_cancelled_at,
          locked: j.paid_at !== null || j.ledger_entry_id !== null || reported.has(j.id) || reconciled });
      }
    }

    const plan = planHostexReconciliation({ stays, tokenPropertyIds: tokenProperties.map((p) => p.id), listings, jobs, cutoffs, now });
    if (dryRun) return { ok: true, dryRun, summary: plan.summary, plan };

    // Dry runs expose proposed changes; real sync summaries report successful
    // mutations only, including write-time races and idempotent RPC no-ops.
    const applied = { ...plan.summary, linked: 0, moved: 0, created: 0, cancelled: 0, flagged: 0 };
    const errors: string[] = [];
    const step = async (label: string, run: () => Promise<void>) => {
      try { await run(); } catch (err) { errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`); }
    };
    const unitName = (id: string) => (units.get(id)?.name as string | undefined) ?? "A property";
    const when = (iso: string, unitId: string) => formatInTimeZone(iso, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, units.get(unitId)?.timezone ?? DEFAULT_TIMEZONE);
    const jobUnit = new Map(jobs.map((j) => [j.id, j.propertyId]));
    const originalJobs = new Map(jobs.map((j) => [j.id, j]));
    const mutate = async (jobId: string, ownerId: string, kind: string, patch: Record<string, unknown>) => {
      const original = originalJobs.get(jobId)!;
      const linked = plan.links.find((link) => link.jobId === jobId);
      const { data, error } = await supabase.rpc("apply_hostex_job_change", { target_id: jobId, tenant: ownerId, change_kind: kind, patch: {
        expected_code: kind === "link" ? original.hostexReservationCode : linked?.patch.hostex_reservation_code ?? original.hostexReservationCode,
        expected_stay_code: kind === "link" ? original.hostexStayCode ?? null : linked?.patch.hostex_stay_code ?? original.hostexStayCode ?? null,
        expected_checkout_at: original.checkoutAt, ...patch,
      } });
      if (error) throw new Error(error.message);
      return data === true;
    };

    if (plan.reservations.length) await step("Reservation import", async () => {
      const { error } = await supabase.from("reservations").upsert(plan.reservations, { onConflict: "property_id,source_reference" });
      if (error) throw new Error(error.message);
    });
    for (const removed of plan.removedReservations) await step("Reservation removal", async () => {
      const { error } = await supabase.from("reservations").delete().eq("owner_id", removed.ownerId).eq("source_type", "hostex").eq("source_reference", removed.sourceReference);
      if (error) throw new Error(error.message);
    });

    for (const link of plan.links) await step("Job link", async () => {
      if (await mutate(link.jobId, link.ownerId, "link", { ...link.patch, expected_code: link.previousCode })) applied.linked++;
    });
    for (const arrival of plan.arrivals) await step("Next arrival", async () => {
      await mutate(arrival.jobId, arrival.ownerId, "arrival", arrival.patch);
    });

    for (const move of plan.moves) await step("Job move", async () => {
      const changed = await mutate(move.jobId, move.ownerId, "move", move.patch);
      if (changed) applied.moved++;
      const unitId = jobUnit.get(move.jobId)!;
      if (changed && move.cleanerId) await sendNotification({ ownerId: move.ownerId, recipientId: move.cleanerId, assignmentId: move.jobId,
        type: "assignment_rescheduled", title: "Job moved", url: `/jobs/${move.jobId}`,
        body: `${unitName(unitId)} moved from ${when(move.previousDueAt, unitId)} to ${when(move.patch.due_at, unitId)}. The guest changed their booking.` });
    });

    for (const job of plan.creates) await step("Cleaning import", async () => {
      const { data, error } = await supabase.rpc("create_hostex_cleaning", { payload: {
        owner_id: job.ownerId, property_id: job.unitId, listing_property_id: job.listingId,
        booking_channel: job.channel, hostex_reservation_code: job.code, hostex_stay_code: job.stayCode,
        checkout_at: job.checkoutAt, due_at: job.dueAt, next_checkin_at: job.nextCheckinAt,
      } });
      if (error) throw new Error(error.message);
      if (data?.created === true || data?.revived === true) applied.created++;
    });

    for (const job of plan.cancels) await step("Job cancellation", async () => {
      const changed = await mutate(job.jobId, job.ownerId, "cancel", {});
      if (changed) applied.cancelled++;
      const unitId = jobUnit.get(job.jobId)!;
      if (changed && job.cleanerId) await sendNotification({ ownerId: job.ownerId, recipientId: job.cleanerId, assignmentId: job.jobId,
        type: "assignment_cancelled", title: "Job cancelled", url: "/jobs",
        body: `${unitName(unitId)} on ${when(job.dueAt, unitId)} is cancelled. The guest cancelled the booking.` });
    });

    for (const flag of plan.flags) await step("Cancellation flag", async () => {
      const { data, error } = await supabase.rpc("flag_hostex_cleaning", {
        target_id: flag.jobId, tenant: flag.ownerId,
        expectations: { expected_code: originalJobs.get(flag.jobId)?.hostexReservationCode ?? null,
          expected_stay_code: originalJobs.get(flag.jobId)?.hostexStayCode ?? null,
          expected_checkout_at: originalJobs.get(flag.jobId)?.checkoutAt ?? null },
        issue_title: "Booking changed after the cleaning was locked",
        issue_description: `Hostex reservation ${flag.code} was cancelled or changed dates. The job was not changed automatically; review it before paying.`,
      });
      if (error) throw new Error(error.message);
      if (data === true) applied.flagged++;
    });

    return { ok: errors.length === 0, dryRun, summary: applied, ...(errors.length ? { error: [...new Set(errors)].join("; ") } : {}) };
  } catch (err) {
    console.error("[syncHostexReservations]", err);
    return { ok: false, dryRun, summary: null, error: "Hostex reservation sync failed; iCal feeds remain in effect." };
  }
}
