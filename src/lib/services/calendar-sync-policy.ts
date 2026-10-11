import type { TurnoverCandidate } from "@/lib/ical/parser";

/** Feed history remains reservation history; it must not recreate overdue jobs. */
export function shouldImportTurnover(
  candidate: TurnoverCandidate,
  sameDayCleanings: Array<{ status: string }>,
  now: Date,
): boolean {
  if (new Date(candidate.dueAt).getTime() <= now.getTime()) return false;
  // A completed or manually entered job is equally canonical for this turnover.
  return !sameDayCleanings.some((job) => job.status !== "cancelled");
}

/** A physical unit's next guest may arrive through a different listing feed. */
export function nextArrivalAfterCheckout(checkoutAt: string, starts: string[]): string | null {
  const checkout = new Date(checkoutAt).getTime();
  return starts
    .filter((start) => new Date(start).getTime() >= checkout)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
}
