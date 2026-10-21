type FeedReservation = {
  calendar_source_id: string | null;
  end_at: string;
  source: { active: boolean; retired_at: string | null } | null;
};

/** Feed retirement hides stale future bookings, not genuine historical stays. */
export function visibleCalendarReservations<T extends FeedReservation>(
  rows: T[],
): (T & { historical: boolean })[] {
  return rows
    .filter(
      (row) =>
        !row.calendar_source_id ||
        row.source?.active ||
        (row.source?.retired_at &&
          new Date(row.end_at).getTime() <=
            new Date(row.source.retired_at).getTime()),
    )
    .map((row) => ({
      ...row,
      historical: !!row.calendar_source_id && !row.source?.active,
    }));
}

type StayRow = { source_type?: string | null; property_id: string; listing_property_id?: string | null; start_at: string; end_at: string };

/** A Hostex reservation supersedes the iCal mirror of the same stay on the same listing. */
export function withoutHostexMirrors<T extends StayRow>(rows: T[]): T[] {
  const key = (r: T) => JSON.stringify([r.listing_property_id ?? r.property_id, r.start_at.slice(0, 10), r.end_at.slice(0, 10)]);
  const hostex = new Set(rows.filter((r) => r.source_type === "hostex").map(key));
  return rows.filter((r) => r.source_type === "hostex" || !hostex.has(key(r)));
}
