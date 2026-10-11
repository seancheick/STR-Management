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
