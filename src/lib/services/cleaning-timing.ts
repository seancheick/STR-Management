import { dateKeyInTimeZone, formatInTimeZone } from "@/lib/ical/timezone";
import { formatTurnoverWindow } from "@/lib/domain/assignments";

type TimingInput = {
  checkout_at: string | null;
  due_at: string;
  next_checkin_at: string | null;
  properties?: { timezone?: string | null } | null;
};

export function getCleaningTiming(input: TimingInput): {
  mode: "firm" | "flexible" | "manual" | "conflict";
  summary: string;
  detail: string;
  startLabel: string | null;
  deadlineLabel: string | null;
  minutes: number | null;
} {
  const zone = input.properties?.timezone;
  const time = (iso: string) => formatInTimeZone(iso, { hour: "numeric", minute: "2-digit" }, zone).replace(":00", "");
  const conflict = { mode: "conflict" as const, summary: "Check turnover times", detail: "The recorded turnover times need review.", startLabel: null, deadlineLabel: null, minutes: null };
  if (!input.checkout_at) {
    if (!Number.isFinite(Date.parse(input.due_at))) return conflict;
    const deadlineLabel = time(input.due_at);
    return { mode: "manual", summary: `Due ${deadlineLabel}`, detail: "Scheduled cleaning deadline.", startLabel: null, deadlineLabel, minutes: null };
  }
  const checkout = new Date(input.checkout_at);
  if (!Number.isFinite(checkout.getTime())) return conflict;
  const startLabel = time(input.checkout_at);
  if (input.next_checkin_at) {
    const arrival = new Date(input.next_checkin_at);
    if (!Number.isFinite(arrival.getTime()) || arrival < checkout) return conflict;
    if (dateKeyInTimeZone(checkout, zone) === dateKeyInTimeZone(arrival, zone)) {
      const minutes = Math.round((arrival.getTime() - checkout.getTime()) / 60000);
      const deadlineLabel = time(input.next_checkin_at);
      return { mode: "firm", summary: `${startLabel}–${deadlineLabel} · ${formatTurnoverWindow(minutes)} window`, detail: "Firm same-day deadline: finish before the next guest checks in.", startLabel, deadlineLabel, minutes };
    }
  }
  const due = new Date(input.due_at);
  const sameDayTarget = Number.isFinite(due.getTime()) && dateKeyInTimeZone(checkout, zone) === dateKeyInTimeZone(due, zone) ? time(input.due_at) : null;
  return { mode: "flexible", summary: `After ${startLabel} · Flexible`, detail: `Same-day cleaning preferred in case a late reservation arrives.${sameDayTarget ? ` Ready target: ${sameDayTarget}; timing is flexible.` : ""} No same-day check-in is currently recorded.`, startLabel, deadlineLabel: null, minutes: null };
}
