export type Cadence = "weekly" | "monthly" | "quarterly" | "annual";

export function advanceNextRun(from: Date, cadence: Cadence): Date {
  const next = new Date(from);
  if (cadence === "weekly") next.setDate(next.getDate() + 7);
  else if (cadence === "monthly") next.setMonth(next.getMonth() + 1);
  else if (cadence === "quarterly") next.setMonth(next.getMonth() + 3);
  else if (cadence === "annual") next.setFullYear(next.getFullYear() + 1);
  return next;
}
