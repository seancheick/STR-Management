export type HealthState = "healthy" | "attention" | "unknown";

export function calendarSourceHealth(source: {
  last_synced_at: string | null;
  sync_logs: { result: string; conflict_count: number; error_message: string | null } | null;
  check_error?: boolean;
}, now: number): { state: HealthState; label: string } {
  if (source.check_error) return { state: "unknown", label: "Unavailable" };
  const log = source.sync_logs;
  if (log?.result === "failed") return { state: "attention", label: "Sync failed" };
  if (log?.result === "partial" || log?.error_message || (log?.conflict_count ?? 0) > 0) return { state: "attention", label: "Review sync" };
  if (!source.last_synced_at) return { state: "unknown", label: "Not synced yet" };
  const age = now - Date.parse(source.last_synced_at);
  if (!Number.isFinite(age) || age < 0) return { state: "unknown", label: "Check timestamp" };
  if (age >= 28 * 3_600_000) return { state: "attention", label: "Sync overdue" };
  if (!log || log.result !== "success") return { state: "unknown", label: "Result unavailable" };
  return { state: "healthy", label: "Up to date" };
}

export function healthTimeAgo(iso: string | null, now: number): string {
  if (!iso) return "No recorded activity";
  const age = now - Date.parse(iso);
  if (!Number.isFinite(age) || age < 0) return "Timestamp unavailable";
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
