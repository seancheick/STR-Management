"use client";

import { Loader2, Repeat, Trash2 } from "lucide-react";
import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  createRecurringTaskAction,
  deleteRecurringTaskAction,
  type RecurringTaskActionState,
} from "@/app/(admin)/dashboard/properties/recurring-actions";
import type { RecurringTaskRecord } from "@/lib/queries/recurring-tasks";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { showToast } from "@/components/ui/toast";

const CADENCES: Array<{ value: string; label: string }> = [
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "annual", label: "Every year" },
];

function formatCadence(c: string): string {
  return CADENCES.find((x) => x.value === c)?.label ?? c;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const initial: RecurringTaskActionState = { status: "idle", message: null };

type Props = {
  propertyId: string;
  tasks: RecurringTaskRecord[];
  cleaners: TeamMemberRecord[];
};

export function RecurringTasksSection({ propertyId, tasks, cleaners }: Props) {
  const [state, formAction] = useActionState(createRecurringTaskAction, initial);
  const [isDeleting, startDelete] = useTransition();

  function handleDelete(taskId: string) {
    if (!confirm("Remove this recurring task? Future instances won't be scheduled.")) return;
    startDelete(async () => {
      const res = await deleteRecurringTaskAction(taskId, propertyId);
      if (res.error) showToast(res.error, "error");
      else showToast("Removed.");
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Recurring work</h2>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
          No recurring tasks yet. Think: deep clean every quarter, HVAC filter every 3
          months, carpet cleaning every 6 months.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks
            .filter((t) => t.active)
            .map((t) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3"
                key={t.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCadence(t.cadence)} · next {formatDate(t.next_run_at)}
                    {t.assignee?.full_name && ` · ${t.assignee.full_name}`}
                    {t.fixed_payout_amount !== null &&
                      ` · $${Number(t.fixed_payout_amount).toFixed(2)}`}
                  </p>
                </div>
                <button
                  aria-label="Remove"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                  disabled={isDeleting}
                  onClick={() => handleDelete(t.id)}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
        </ul>
      )}

      <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4">
        <input name="propertyId" type="hidden" value={propertyId} />
        <p className="text-sm font-medium">Add recurring task</p>
        <input
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
          maxLength={120}
          name="title"
          placeholder="e.g. Quarterly deep clean"
          required
          type="text"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            defaultValue="monthly"
            name="cadence"
            required
          >
            {CADENCES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            name="nextRunAt"
            required
            type="date"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            defaultValue=""
            name="assigneeId"
          >
            <option value="">Unassigned</option>
            {cleaners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
          <input
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            min="0"
            name="fixedPayoutAmount"
            placeholder="Payout ($)"
            step="0.01"
            type="number"
          />
        </div>
        {state.message && (
          <p
            className={
              state.status === "error"
                ? "text-xs text-destructive"
                : "text-xs text-green-700"
            }
          >
            {state.message}
          </p>
        )}
        <SubmitButton />
      </form>
    </section>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      Add recurring task
    </button>
  );
}
