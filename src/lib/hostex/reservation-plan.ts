import type { HostexReservation } from "./client";
import { hostexChannel } from "@/lib/reservations/channel";
import { DEFAULT_CHECKIN_HOUR, DEFAULT_CHECKOUT_HOUR, dateKeyInTimeZone, zonedTimeToUtc } from "@/lib/ical/timezone";
import { SYNC_MUTABLE_STATUSES } from "@/lib/ical/reconcile";

/** A tenant listing mapped to a Hostex property, resolved to the physical unit it cleans. */
export type HostexListing = { id: string; ownerId: string; hostexPropertyId: number; unitId: string; timeZone: string };

export type HostexPlanJob = {
  id: string; ownerId: string; propertyId: string; status: string; sourceType: string | null;
  checkoutAt: string | null; dueAt: string; nextCheckinAt?: string | null; cleanerId: string | null;
  hostexReservationCode: string | null; hostexStayCode?: string | null; bookingChannel: string | null; reservationCancelledAt: string | null;
  /** Paid, ledger-reconciled or linked to a payout report. Never altered. */
  locked: boolean;
};

export type HostexPlanInput = {
  stays: HostexReservation[];
  /** Property IDs from the token's own GET /properties. */
  tokenPropertyIds: number[];
  listings: HostexListing[];
  jobs: HostexPlanJob[];
  /** Latest reconciled_through date per owner; no job is created on or before it. */
  cutoffs: Record<string, string>;
  now: Date;
};

type Stay = {
  code: string; stayCode: string; ownerId: string; listingId: string; unitId: string; timeZone: string;
  day: string; channel: ReturnType<typeof hostexChannel>; guestName: string | null;
  checkinAt: string; checkoutAt: string; dueAt: string; status: HostexReservation["status"];
};

export type HostexPlan = {
  reservations: Array<{ owner_id: string; property_id: string; listing_property_id: string; source_type: "hostex"; source_reference: string; calendar_source_id: null; platform: string; guest_name: string | null; start_at: string; end_at: string; summary: null }>;
  removedReservations: Array<{ ownerId: string; sourceReference: string }>;
  links: Array<{ jobId: string; ownerId: string; code: string; previousCode: string | null; patch: { hostex_reservation_code: string; hostex_stay_code: string; booking_channel: string } }>;
  moves: Array<{ jobId: string; ownerId: string; code: string; cleanerId: string | null; previousDueAt: string; patch: { checkout_at: string; due_at: string; next_checkin_at: string | null } }>;
  arrivals: Array<{ jobId: string; ownerId: string; patch: { next_checkin_at: string | null } }>;
  creates: Array<{ ownerId: string; listingId: string; unitId: string; code: string; stayCode: string; channel: string; checkoutAt: string; dueAt: string; nextCheckinAt: string | null }>;
  cancels: Array<{ jobId: string; ownerId: string; code: string; cleanerId: string | null; dueAt: string }>;
  flags: Array<{ jobId: string; ownerId: string; propertyId: string; code: string }>;
  summary: { stays: number; ignored: number; pending: number; matched: number; linked: number; moved: number; created: number; skippedBeforeCutoff: number; skippedPast: number; cancelled: number; flagged: number };
};

export const hostexSourceReference = (stayCode: string) => `hostex:${stayCode}`;

const at = (date: string, hour: number, timeZone: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return zonedTimeToUtc(y, m, d, hour, 0, timeZone).toISOString();
};

/**
 * Decides how cleaning jobs follow Hostex reservations. One stay owns one job
 * per physical unit and checkout day; an existing job (usually iCal-created)
 * on that day is linked rather than duplicated. Only unstarted, unpaid jobs
 * before checkout are moved or cancelled; anything else is flagged.
 */
export function planHostexReconciliation(input: HostexPlanInput): HostexPlan {
  const plan: HostexPlan = { reservations: [], removedReservations: [], links: [], moves: [], arrivals: [], creates: [], cancels: [], flags: [],
    summary: { stays: 0, ignored: 0, pending: 0, matched: 0, linked: 0, moved: 0, created: 0, skippedBeforeCutoff: 0, skippedPast: 0, cancelled: 0, flagged: 0 } };
  const now = input.now.getTime();

  // Tenant guard: the token must own the Hostex property and exactly one tenant listing must map it.
  const tokenIds = new Set(input.tokenPropertyIds);
  const mapped = new Map<number, HostexListing[]>();
  for (const listing of input.listings) mapped.set(listing.hostexPropertyId, [...(mapped.get(listing.hostexPropertyId) ?? []), listing]);

  const unique = new Map(input.stays.map((s) => [s.stay_code, s]));
  const stays: Stay[] = [];
  for (const s of unique.values()) {
    const owners = mapped.get(s.property_id) ?? [];
    if (!tokenIds.has(s.property_id) || owners.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(s.check_out_date) || !/^\d{4}-\d{2}-\d{2}$/.test(s.check_in_date)) { plan.summary.ignored++; continue; }
    const listing = owners[0];
    stays.push({
      code: s.reservation_code, stayCode: s.stay_code, ownerId: listing.ownerId, listingId: listing.id, unitId: listing.unitId,
      timeZone: listing.timeZone, day: s.check_out_date, channel: hostexChannel(s.channel_type), guestName: s.guest_name?.trim() || null,
      checkinAt: at(s.check_in_date, DEFAULT_CHECKIN_HOUR, listing.timeZone), checkoutAt: at(s.check_out_date, DEFAULT_CHECKOUT_HOUR, listing.timeZone),
      dueAt: at(s.check_out_date, DEFAULT_CHECKIN_HOUR, listing.timeZone), status: s.status,
    });
  }
  plan.summary.stays = stays.length;

  const accepted = stays.filter((s) => s.status === "accepted").sort((a, b) => a.day.localeCompare(b.day));
  const sameUnit = (s: Stay, ownerId: string, unitId: string) => s.ownerId === ownerId && s.unitId === unitId;
  const nextCheckin = (stay: Stay) => accepted
    .filter((s) => sameUnit(s, stay.ownerId, stay.unitId) && s.checkinAt >= stay.checkoutAt)
    .map((s) => s.checkinAt).sort()[0] ?? null;
  const jobDay = (job: HostexPlanJob, timeZone: string) => dateKeyInTimeZone(new Date(job.checkoutAt ?? job.dueAt), timeZone);
  const automated = (job: HostexPlanJob) => job.sourceType === "ical" || job.sourceType === "hostex";
  const mutable = (job: HostexPlanJob) => automated(job) && !job.locked && (SYNC_MUTABLE_STATUSES as readonly string[]).includes(job.status) &&
    new Date(job.checkoutAt ?? job.dueAt).getTime() > now;
  // Legacy links contain only reservation_code. Moving them is safe only when
  // that reservation has a single stay on this physical unit.
  const linkedTo = (job: HostexPlanJob, stay: Stay) => job.hostexStayCode
    ? job.hostexStayCode === stay.stayCode
    : job.hostexReservationCode === stay.code && stays.filter((s) => s.ownerId === stay.ownerId && s.unitId === stay.unitId && s.code === stay.code).length === 1;
  const claimed = new Set<string>();
  const createdDays = new Set<string>();
  const live = (stay: Stay) => input.jobs.filter((j) => j.ownerId === stay.ownerId && j.propertyId === stay.unitId && j.status !== "cancelled" && !claimed.has(j.id));
  const retire = (job: HostexPlanJob, code: string) => {
    claimed.add(job.id);
    if (mutable(job)) { plan.cancels.push({ jobId: job.id, ownerId: job.ownerId, code, cleanerId: job.cleanerId, dueAt: job.dueAt }); plan.summary.cancelled++; }
    else if (!job.reservationCancelledAt) { plan.flags.push({ jobId: job.id, ownerId: job.ownerId, propertyId: job.propertyId, code }); plan.summary.flagged++; }
  };

  for (const stay of accepted) {
    plan.reservations.push({ owner_id: stay.ownerId, property_id: stay.unitId, listing_property_id: stay.listingId, source_type: "hostex",
      source_reference: hostexSourceReference(stay.stayCode), calendar_source_id: null, platform: stay.channel, guest_name: stay.guestName,
      start_at: stay.checkinAt, end_at: stay.checkoutAt, summary: null });
    const jobs = live(stay);
    const onDay = jobs.filter((j) => jobDay(j, stay.timeZone) === stay.day);
    const linked = jobs.filter((j) => linkedTo(j, stay));
    let target = onDay.find((j) => linkedTo(j, stay)) ?? onDay.find((j) => !j.hostexReservationCode)
      ?? onDay.find((j) => !accepted.some((other) => linkedTo(j, other)));
    if (!target && !onDay.length) {
      // The guest changed dates: move this stay's unstarted job instead of creating a second one.
      target = linked.find((j) => mutable(j) && new Date(stay.dueAt).getTime() > now);
      if (target) {
        plan.moves.push({ jobId: target.id, ownerId: stay.ownerId, code: stay.code, cleanerId: target.cleanerId, previousDueAt: target.dueAt,
          patch: { checkout_at: stay.checkoutAt, due_at: stay.dueAt, next_checkin_at: nextCheckin(stay) } });
        plan.summary.moved++;
      }
    }
    if (target) {
      claimed.add(target.id);
      if (mutable(target) && !plan.moves.some((m) => m.jobId === target.id) &&
        (target.nextCheckinAt ?? null) !== nextCheckin(stay)) {
        plan.arrivals.push({ jobId: target.id, ownerId: stay.ownerId, patch: { next_checkin_at: nextCheckin(stay) } });
      }
      if (automated(target) && !target.locked && (target.hostexReservationCode !== stay.code || target.hostexStayCode !== stay.stayCode || target.bookingChannel !== stay.channel)) {
        plan.links.push({ jobId: target.id, ownerId: stay.ownerId, code: stay.code, previousCode: target.hostexReservationCode, patch: { hostex_reservation_code: stay.code, hostex_stay_code: stay.stayCode, booking_channel: stay.channel } });
        plan.summary.linked++;
      } else plan.summary.matched++;
    } else if (onDay.length) {
      // Another stay's job already covers this unit's turnover that day.
      plan.summary.matched++;
    } else {
      const key = JSON.stringify([stay.ownerId, stay.unitId, stay.day]);
      const cutoff = input.cutoffs[stay.ownerId];
      if (cutoff && stay.day <= cutoff) plan.summary.skippedBeforeCutoff++;
      else if (new Date(stay.dueAt).getTime() <= now) plan.summary.skippedPast++;
      else if (createdDays.has(key)) plan.summary.matched++;
      else {
        createdDays.add(key);
        plan.creates.push({ ownerId: stay.ownerId, listingId: stay.listingId, unitId: stay.unitId, code: stay.code, stayCode: stay.stayCode,
          channel: stay.channel, checkoutAt: stay.checkoutAt, dueAt: stay.dueAt, nextCheckinAt: nextCheckin(stay) });
        plan.summary.created++;
      }
    }
    // This stay's job left on another day after a date change can no longer stand.
    for (const stale of linked) if (stale !== target && !claimed.has(stale.id)) retire(stale, stay.code);
  }

  for (const stay of stays) {
    if (stay.status === "wait_accept" || stay.status === "wait_pay") { plan.summary.pending++; continue; }
    if (stay.status === "accepted") continue;
    plan.removedReservations.push({ ownerId: stay.ownerId, sourceReference: hostexSourceReference(stay.stayCode) });
    if (stay.status !== "cancelled") continue;
    const jobs = live(stay);
    const linked = jobs.filter((j) => linkedTo(j, stay));
    // An unlinked job that day may belong to another booking; only take it when no live stay covers the day.
    const covered = accepted.some((s) => sameUnit(s, stay.ownerId, stay.unitId) && s.day === stay.day);
    const targets = linked.length ? linked.filter((j) => !accepted.some((s) => sameUnit(s, stay.ownerId, stay.unitId) && s.day === jobDay(j, stay.timeZone))) : covered ? [] : jobs.filter((j) =>
      !j.hostexReservationCode && (j.sourceType === "ical" || j.sourceType === "hostex") && jobDay(j, stay.timeZone) === stay.day);
    for (const job of targets) retire(job, stay.code);
  }
  return plan;
}
