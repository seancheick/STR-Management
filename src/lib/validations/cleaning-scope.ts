import { z } from "zod/v4";
const money = z.number().min(0).max(100000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "Use at most two decimal places.");
export const cleaningScopeCorrectionSchema = z.object({
  requestId: z.guid().describe("New UUID per correction; reuse the same UUID only when retrying that correction."),
  assignmentId: z.guid(),
  scopePropertyId: z.guid().describe("Actual cleaning configuration from get_cleaning_scope, within the same physical unit."),
  total: money.refine(value => value > 0, "Enter a positive total.").describe("Corrected total pay in dollars, including any existing extras."),
  expectedScopePropertyId: z.guid().describe("currentScopeId from the preview; rejects a scope changed since preview."),
  expectedCurrentTotal: money.describe("Current total from the preview; rejects a stale correction."),
  reason: z.string().trim().min(3).max(1000),
});
export type CleaningScopeCorrectionInput = z.input<typeof cleaningScopeCorrectionSchema>;
