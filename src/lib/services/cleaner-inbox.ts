type InboxNotification = {
  assignment_id: string | null;
  notification_type: string;
  seen_at: string | null;
  assignment: { status: string } | null;
};

/** Keep current offers and meaningful updates; collapse delivery-channel copies. */
export function currentCleanerNotifications<T extends InboxNotification>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.assignment_id) return true;
    const terminal =
      row.assignment?.status === "approved" ||
      row.assignment?.status === "cancelled";
    const offer = [
      "new_assignment",
      "assignment_rescheduled",
      "reminder_24h",
      "reminder_2h",
      "overdue",
      "sla_breach",
    ].includes(row.notification_type);
    if (terminal && offer) return false;
    if (row.notification_type === "assignment_cancelled" && row.seen_at)
      return false;
    const key = `${row.assignment_id}:${row.notification_type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
