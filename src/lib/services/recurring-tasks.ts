import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAssignment } from "@/lib/services/assignment-service";
import { advanceNextRun, type Cadence } from "@/lib/domain/recurring";

export { advanceNextRun };
export type { Cadence };

type RecurringRow = {
  id: string;
  owner_id: string;
  property_id: string;
  title: string;
  description: string | null;
  cadence: Cadence;
  next_run_at: string;
  assignee_id: string | null;
  primary_checklist_template_id: string | null;
  fixed_payout_amount: number | null;
  expected_duration_min: number | null;
};

/**
 * Sweep any active recurring tasks whose next_run_at is due.
 * For each, creates an assignment and rolls next_run_at forward by one cadence.
 * Idempotent — safe to run repeatedly.
 */
export async function runRecurringTaskSweep(): Promise<{
  created: number;
  errors: Array<{ taskId: string; error: string }>;
}> {
  const supabase = await createServerSupabaseClient();
  const now = new Date();

  const { data: due, error } = await supabase
    .from("recurring_tasks")
    .select(
      "id, owner_id, property_id, title, description, cadence, next_run_at, assignee_id, primary_checklist_template_id, fixed_payout_amount, expected_duration_min",
    )
    .eq("active", true)
    .lte("next_run_at", now.toISOString());

  if (error) return { created: 0, errors: [{ taskId: "query", error: error.message }] };

  const rows = (due as RecurringRow[] | null) ?? [];
  const errors: Array<{ taskId: string; error: string }> = [];
  let created = 0;

  for (const task of rows) {
    const result = await createAssignment({
      ownerId: task.owner_id,
      propertyId: task.property_id,
      cleanerId: task.assignee_id,
      dueAt: task.next_run_at,
      checkoutAt: null,
      priority: "normal",
      expectedDurationMin: task.expected_duration_min,
      fixedPayoutAmount: task.fixed_payout_amount,
      primaryChecklistTemplateId: task.primary_checklist_template_id,
      createdByUserId: task.owner_id,
    });

    if (!result.success) {
      errors.push({ taskId: task.id, error: result.error });
      continue;
    }

    const nextRun = advanceNextRun(new Date(task.next_run_at), task.cadence);
    await supabase
      .from("recurring_tasks")
      .update({
        last_run_at: now.toISOString(),
        next_run_at: nextRun.toISOString(),
      })
      .eq("id", task.id);
    created++;
  }

  return { created, errors };
}
