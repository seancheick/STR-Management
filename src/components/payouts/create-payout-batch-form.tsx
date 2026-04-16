"use client";

import { useActionState, useRef } from "react";

import { createPayoutBatchAction } from "@/app/(admin)/dashboard/payouts/actions";

type Cleaner = { id: string; full_name: string };

type Props = {
  cleaners: Cleaner[];
};

const initialState = { error: null as string | null };

export function CreatePayoutBatchForm({ cleaners }: Props) {
  const [state, action, isPending] = useActionState(
    createPayoutBatchAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="label">
            Batch label
          </label>
          <input
            id="label"
            name="label"
            type="text"
            placeholder="e.g. April 2026 Payouts"
            required
            className="rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="cleaner_filter">
            Cleaner (optional)
          </label>
          <select
            id="cleaner_filter"
            name="cleaner_filter"
            className="rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">All cleaners</option>
            {cleaners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="period_start">
            Period start
          </label>
          <input
            id="period_start"
            name="period_start"
            type="date"
            required
            className="rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="period_end">
            Period end
          </label>
          <input
            id="period_end"
            name="period_end"
            type="date"
            required
            className="rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="notes">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className="rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Generating…" : "Generate batch"}
        </button>
      </div>
    </form>
  );
}
