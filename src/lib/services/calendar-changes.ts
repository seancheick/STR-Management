import "server-only";

import { requireRole } from "@/lib/auth/session";
import { AgentToolError } from "@/lib/agent/errors";
import { getListingCalendars, updateListingPrices, updateListingRestrictions, type HostexCalendarDay } from "@/lib/hostex/client";
import { localDate } from "@/lib/services/bookability-runner";
import { beforeSnapshot, changeSpan, compareReadback, priceWarnings, samePayload, validateChange, type ChangeKind, type ChangeRange } from "@/lib/services/calendar-change-rules";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Owner-approved Hostex calendar writes: preview → apply (idempotent by
 * requestId) → verify by reading the channel calendar back. Hostex accepts
 * writes asynchronously, so "submitted" never means "live".
 */
export type CalendarChangeInput = { channelType: string; listingId: string; kind: ChangeKind; ranges: ChangeRange[] };

const PENDING_GRACE_MINUTES = 15;
const TIME_ZONE = "America/New_York";

async function target(ownerId: string, channelType: string, listingId: string) {
  const { data, error } = await createServiceSupabaseClient().from("channel_listings")
    .select("channel_type, listing_id, property_title, listing_title, currency, pricing_authority, price_readonly")
    .eq("owner_id", ownerId).eq("channel_type", channelType).eq("listing_id", listingId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AgentToolError("Channel calendar not found. Use get_bookability_report for valid channelType/listingId pairs.");
  return data;
}

async function readCalendar(channelType: string, listingId: string, ranges: ChangeRange[]) {
  const span = changeSpan(ranges);
  const [cal] = await getListingCalendars([{ channel_type: channelType, listing_id: listingId }], span.start, span.end);
  return new Map<string, HostexCalendarDay>((cal?.calendar ?? []).map((d) => [d.date, d]));
}

export async function previewCalendarChange(input: CalendarChangeInput) {
  const profile = await requireRole(["owner", "admin"]);
  const listing = await target(profile.owner_id, input.channelType, input.listingId);
  const errors = validateChange(input.kind, input.ranges, listing, localDate(TIME_ZONE));
  const current = errors.length ? new Map<string, HostexCalendarDay>() : await readCalendar(input.channelType, input.listingId, input.ranges);
  return {
    valid: errors.length === 0, errors,
    warnings: input.kind === "price" ? priceWarnings(input.ranges, current) : [],
    listing,
    nights: errors.length ? null : Object.keys(beforeSnapshot(input.kind, input.ranges, current)).length,
    current: errors.length ? null : beforeSnapshot(input.kind, input.ranges, current),
    next: "Show this preview to the owner. After explicit approval call apply_calendar_change with a new requestId and the same details.",
  };
}

export async function applyCalendarChange(input: CalendarChangeInput & { requestId: string }) {
  const profile = await requireRole(["owner", "admin"]);
  const db = createServiceSupabaseClient();
  const payload = { channelType: input.channelType, listingId: input.listingId, kind: input.kind, ranges: input.ranges };
  const existing = await db.from("calendar_change_requests").select("*").eq("request_id", input.requestId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    if (existing.data.owner_id !== profile.owner_id || !samePayload(existing.data.payload, payload)) throw new AgentToolError("requestId already used with different details. Use a new requestId for a new change.");
    return { ...existing.data, retried: true };
  }
  const listing = await target(profile.owner_id, input.channelType, input.listingId);
  const errors = validateChange(input.kind, input.ranges, listing, localDate(TIME_ZONE));
  if (errors.length) throw new AgentToolError(errors.join(" "));
  const before = beforeSnapshot(input.kind, input.ranges, await readCalendar(input.channelType, input.listingId, input.ranges));
  // Claim the requestId before calling Hostex, so concurrent retries cannot send twice.
  const claim = await db.from("calendar_change_requests").insert({
    request_id: input.requestId, owner_id: profile.owner_id, channel_type: input.channelType, listing_id: input.listingId,
    kind: input.kind, payload, before, status: "submitted", requested_by: profile.id,
  }).select("*").single();
  if (claim.error) {
    if (claim.error.code === "23505") throw new AgentToolError("This requestId is already being processed. Retry with the same details to read its result.");
    throw new Error(claim.error.message);
  }
  try {
    if (input.kind === "price") await updateListingPrices(input.channelType, input.listingId, input.ranges.map((r) => ({ start_date: r.start_date, end_date: r.end_date, price: r.price! })));
    else await updateListingRestrictions(input.channelType, input.listingId, input.ranges);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from("calendar_change_requests").update({ status: "failed", error: message.slice(0, 500) }).eq("request_id", input.requestId);
    throw new AgentToolError(`Hostex rejected the change: ${message}. Nothing was applied; fix the cause and use a new requestId.`);
  }
  return { ...claim.data, next: "Hostex processes changes asynchronously. Call verify_calendar_change with this requestId in a minute or two." };
}

export async function verifyCalendarChange(requestId: string) {
  const profile = await requireRole(["owner", "admin"]);
  const db = createServiceSupabaseClient();
  const { data: row, error } = await db.from("calendar_change_requests").select("*").eq("request_id", requestId).eq("owner_id", profile.owner_id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new AgentToolError("Calendar change not found.");
  if (row.status === "failed" || row.status === "verified") return row;
  const payload = row.payload as CalendarChangeInput;
  const mismatches = compareReadback(payload.kind, payload.ranges, await readCalendar(payload.channelType, payload.listingId, payload.ranges));
  const waited = (Date.now() - Date.parse(row.submitted_at)) / 60_000;
  const status = !mismatches.length ? "verified" : waited < PENDING_GRACE_MINUTES ? "submitted" : "mismatch";
  const update = { status, mismatches: mismatches.slice(0, 100), verified_at: status === "verified" ? new Date().toISOString() : null };
  const saved = await db.from("calendar_change_requests").update(update).eq("request_id", requestId).select("*").single();
  if (saved.error) throw new Error(saved.error.message);
  return {
    ...saved.data, mismatchCount: mismatches.length,
    next: status === "verified" ? "Live on the channel calendar. Call run_bookability_scan to refresh findings."
      : status === "submitted" ? `Not visible yet (${Math.round(waited)} min since submission). Check again shortly.`
      : "Still different after 15 minutes. Check the task result in the Hostex price portal before resubmitting; never resend blindly.",
  };
}

export async function listCalendarChanges(limit = 20) {
  const profile = await requireRole(["owner", "admin"]);
  const { data, error } = await createServiceSupabaseClient().from("calendar_change_requests")
    .select("request_id, channel_type, listing_id, kind, status, error, submitted_at, verified_at, payload, before")
    .eq("owner_id", profile.owner_id).order("submitted_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data;
}
