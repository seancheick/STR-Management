"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { RestockState } from "@/app/(cleaner)/jobs/actions";
import type { InventoryItemRecord } from "@/lib/queries/issues";

type Props = {
  action: (state: RestockState, formData: FormData) => Promise<RestockState>;
  assignmentId: string;
  inventoryItems: InventoryItemRecord[];
};

const initial: RestockState = { status: "idle", message: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Submitting…" : "Request restock"}
    </button>
  );
}

export function RestockRequestSection({ action, assignmentId, inventoryItems }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initial);

  if (!inventoryItems.length) return null;

  const showForm = open && state.status !== "success";

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Request restock</h2>
        {state.status === "success" ? (
          <span className="text-sm text-green-600">Request sent</span>
        ) : (
          <button
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            {open ? "Cancel" : "Request"}
          </button>
        )}
      </div>

      {/* Low stock indicators */}
      {!open && (
        <ul className="mt-3 space-y-1">
          {inventoryItems
            .filter((i) => i.current_quantity <= i.reorder_threshold)
            .slice(0, 3)
            .map((item) => (
              <li key={item.id} className="flex items-center justify-between text-sm">
                <span>{item.name}</span>
                <span className="font-medium text-amber-600">
                  {item.current_quantity} {item.unit} left
                </span>
              </li>
            ))}
        </ul>
      )}

      {showForm && (
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="assignmentId" value={assignmentId} />

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="inventory-item">
              Item <span className="text-destructive">*</span>
            </label>
            <select
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
              id="inventory-item"
              name="inventoryItemId"
              required
            >
              <option value="">Select an item…</option>
              {inventoryItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.current_quantity} {item.unit} remaining
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="quantity-needed">
              Quantity needed
            </label>
            <input
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
              defaultValue="1"
              id="quantity-needed"
              min="1"
              name="quantityNeeded"
              type="number"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="restock-notes">
              Notes{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
              id="restock-notes"
              name="notes"
              rows={2}
              placeholder="Any extra context…"
            />
          </div>

          {state.status === "error" && state.message && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          <SubmitButton />
        </form>
      )}
    </div>
  );
}
