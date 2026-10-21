"use server";
import { BusinessRuleError } from "@/lib/domain/business-error";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { historyImportSchema, matchStay, parseReservationCsv } from "@/lib/reservations/history";
import { withoutHostexMirrors } from "@/lib/services/calendar-history";

export async function importReservationHistoryAction(input: unknown) {
  await requireRole(["owner", "admin"]);
  const parsed = historyImportSchema.safeParse(input);
  if (!parsed.success) throw new BusinessRuleError(parsed.error.issues[0].message,"invalid_history","import_reservation_history");
  const value = parsed.data;
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("import_reservation_history", { request_id: value.requestId, listing_id: value.listingId, channel_name: value.channel, stay_rows: value.stays });
  if (error) {
    if (["P0001", "22007", "22008", "22023", "23514"].includes(error.code)) throw new BusinessRuleError(error.message,"history_conflict","import_reservation_history");
    throw new Error("Could not import reservation history.");
  }
  return data;
}
export async function importReservationCsvAction(input: { requestId: string; listingId: string; channel: "airbnb" | "booking" | "vrbo" | "other"; csv: string; columns: Parameters<typeof parseReservationCsv>[1]; statusMap: Parameters<typeof parseReservationCsv>[2] }) {
  await requireRole(["owner", "admin"]);
  let stays;
  try { stays = parseReservationCsv(input.csv, input.columns, input.statusMap); }
  catch (error) { throw new BusinessRuleError(error instanceof Error ? error.message : "Invalid CSV.","invalid_history","import_reservation_csv"); }
  return importReservationHistoryAction({ ...input, stays });
}
export async function getReservationHistoryAction(input: { propertyId: string; cleaningDate: string; listingId?: string | null }) {
  const actor = await requireRole(["owner", "admin", "supervisor"]);
  const client = await createServerSupabaseClient();
  const { z } = await import("zod/v4");
  const parsed = z.object({ propertyId: z.guid(), cleaningDate: z.iso.date(), listingId: z.guid().nullish() }).safeParse(input);
  if (!parsed.success) throw new BusinessRuleError(parsed.error.issues[0].message,"invalid_history","get_reservation_history");
  const earliest = new Date(new Date(`${input.cleaningDate}T00:00:00Z`).getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await client.from("historical_reservations").select("id,source_reference,listing_property_id,channel,guest_name,check_in,check_out,status")
    .eq("owner_id", actor.owner_id).eq("property_id", input.propertyId).gte("check_out", earliest).lte("check_out", input.cleaningDate);
  if (error) throw new Error("Could not load reservation history.");
  const { data: listing, error: propertyError } = await client.from("properties").select("timezone").eq("id", input.propertyId).eq("owner_id", actor.owner_id).maybeSingle();
  if (propertyError) throw new Error("Could not load property.");
  if (!listing) throw new BusinessRuleError("Property not found.","not_found","get_reservation_history");
  const { dateKeyInTimeZone, zonedTimeToUtc } = await import("@/lib/ical/timezone");
  const zone = listing.timezone ?? "America/New_York";
  const from = new Date(`${earliest}T00:00:00Z`);
  const to = new Date(`${input.cleaningDate}T00:00:00Z`); to.setUTCDate(to.getUTCDate()+1);
  const bound = (d: Date) => zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate(), 0, 0, zone).toISOString();
  const { data: live, error: liveError } = await client.from("reservations").select("id,property_id,source_type,source_reference,listing_property_id,platform,guest_name,start_at,end_at")
    .eq("owner_id", actor.owner_id).eq("property_id", input.propertyId).gte("end_at", bound(from)).lt("end_at", bound(to));
  if (liveError) throw new Error("Could not load current reservation reference data.");
  const stays = (data ?? []).map(r => ({ id: r.id, sourceReference: r.source_reference, listingId: r.listing_property_id, channel: r.channel, guestName: r.guest_name, checkIn: r.check_in, checkOut: r.check_out, status: r.status, source: "channel_history" }));
  for (const r of withoutHostexMirrors(live ?? [])) stays.push({id:r.id, sourceReference:r.source_reference, listingId:r.listing_property_id ?? input.propertyId, channel:r.platform, guestName:r.guest_name, checkIn:dateKeyInTimeZone(new Date(r.start_at),zone),checkOut:dateKeyInTimeZone(new Date(r.end_at),zone),status:"confirmed",source:"ical"});
  return matchStay(stays, input.cleaningDate, input.listingId);
}
