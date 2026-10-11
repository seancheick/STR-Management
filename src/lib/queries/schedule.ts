import "server-only";
import { listAssignmentsForSchedule } from "@/lib/queries/assignments";
import { listReservationsForRange } from "@/lib/queries/calendar";
import { listProperties } from "@/lib/queries/properties";
import { calendarInstantKey, calendarListingId, calendarWindow, calendarWindowContains } from "@/lib/services/calendar-display";

/** Shared listing/date/filter contract for both owner calendars and extension API. */
export async function getScheduleRange(input: { start: string; end: string; property?: string | null; cleaner?: string | null }) {
  const window = calendarWindow(input.start, input.end);
  if (!window) throw new Error("Invalid calendar date range.");
  const [propertyResult, jobs, bookings] = await Promise.all([
    listProperties(), listAssignmentsForSchedule(window.queryStart, window.queryEnd), listReservationsForRange(window.queryStart, window.queryEnd),
  ]);
  if (propertyResult.error) throw new Error(propertyResult.error);
  const historicalListingIds = new Set(bookings.filter((booking) => booking.historical).map(calendarListingId));
  const properties = propertyResult.data.filter((p) => p.active || historicalListingIds.has(p.id));
  const byId = new Map(properties.map((p) => [p.id, p]));
  const matchesProperty = (row: { property_id: string; listing_property_id?: string | null }) => byId.has(calendarListingId(row)) && (!input.property || calendarListingId(row) === input.property);
  const assignments = jobs.filter((job) => byId.get(calendarListingId(job))?.active && matchesProperty(job) &&
    (!input.cleaner || (input.cleaner === "unassigned" ? job.cleaner_id === null : job.cleaner_id === input.cleaner)) &&
    calendarWindowContains(job.checkout_at ?? job.due_at, window.start, window.end, byId.get(calendarListingId(job))?.timezone),
  );
  const reservations = bookings.filter((booking) => {
    const timezone = byId.get(calendarListingId(booking))?.timezone;
    return matchesProperty(booking) && calendarInstantKey(booking.start_at, timezone) <= window.end && calendarInstantKey(booking.end_at, timezone) >= window.start;
  });
  return { assignments, reservations, properties: input.property ? properties.filter((p) => p.id === input.property) : properties };
}
