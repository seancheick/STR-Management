import { z } from "zod";

const optionalText = z.preprocess((value) => value == null || value === "" ? undefined : value, z.string().trim().optional());
const reportDate = z.string({ required_error: "Choose a report date", invalid_type_error: "Choose a report date" }).refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid date (YYYY-MM-DD)");

export const createPayoutReportSchema = z.object({
  label: optionalText,
  period_start: reportDate,
  period_end: reportDate,
  cleaner_filter: z.preprocess((value) => value === "" ? null : value, z.string().uuid().nullish()),
  notes: optionalText,
}).refine((value) => value.period_start <= value.period_end, {
  message: "Report end date must be on or after the start date", path: ["period_end"],
}).transform((value) => ({
  ...value,
  label: value.label || `Payout report · ${value.period_start} → ${value.period_end}`,
  notes: value.notes || null,
}));
