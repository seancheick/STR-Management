import { dateKeyInTimeZone } from "@/lib/ical/timezone";
export type PlanningPreset = "this-week" | "next-week" | "seven-days" | "next-three" | "next-ten" | "next-count";
type Job = { id: string; checkout_at: string | null; due_at: string; properties?: { timezone?: string | null } | null };
const addDays = (key: string, count: number) => new Date(Date.parse(`${key}T12:00:00Z`) + count * 86400000).toISOString().slice(0,10);
export function planningDateRange(preset: PlanningPreset, now: string, timezone?: string | null) {
  const today = dateKeyInTimeZone(new Date(now), timezone);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7));
  if (preset === "this-week") return { start: today, end: addDays(monday, 6) };
  if (preset === "next-week") return { start: addDays(monday, 7), end: addDays(monday, 13) };
  return { start: today, end: addDays(today, 6) };
}
export function planAssignments<T extends Job>(jobs: T[], preset: PlanningPreset, now: string, count = 3): T[] {
  const sorted = jobs.filter(job => Date.parse(job.due_at) >= Date.parse(now))
    .sort((a,b) => (a.checkout_at ?? a.due_at).localeCompare(b.checkout_at ?? b.due_at) || a.id.localeCompare(b.id));
  if (preset.startsWith("next-") && preset !== "next-week") {
    const limit = preset === "next-three" ? 3 : preset === "next-ten" ? 10 : Math.min(100, Math.max(1, Math.floor(count) || 1));
    return sorted.slice(0, limit);
  }
  return sorted.filter(job => {
    const zone = job.properties?.timezone;
    const range = planningDateRange(preset, now, zone);
    const key = dateKeyInTimeZone(new Date(job.checkout_at ?? job.due_at), zone);
    return key >= range.start && key <= range.end;
  });
}
