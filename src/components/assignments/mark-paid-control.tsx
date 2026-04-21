"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, DollarSign, Undo2 } from "lucide-react";

import {
  markPaidAction,
  markUnpaidAction,
  type MarkPaidState,
} from "@/app/(admin)/dashboard/schedule/actions";

const METHODS: Array<{ value: "zelle" | "venmo" | "cash" | "check" | "bank_transfer" | "other"; label: string }> = [
  { value: "zelle", label: "Zelle" },
  { value: "venmo", label: "Venmo" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

const initialState: MarkPaidState = { status: "idle", message: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-95 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving…" : "Mark paid"}
    </button>
  );
}

function methodLabel(method: string | null): string {
  return METHODS.find((m) => m.value === method)?.label ?? method ?? "paid";
}

export function MarkPaidControl({
  assignmentId,
  paidAt,
  paymentMethod,
  paymentReference,
}: {
  assignmentId: string;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(markPaidAction, initialState);

  if (paidAt) {
    const niceDate = new Date(paidAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-green-900">
              Paid · {methodLabel(paymentMethod)} · {niceDate}
            </p>
            {paymentReference && (
              <p className="mt-0.5 text-xs text-green-800/80">Ref: {paymentReference}</p>
            )}
          </div>
        </div>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-green-200 bg-white px-3 text-xs font-medium text-green-700 transition hover:bg-green-100"
          onClick={async () => {
            if (confirm("Mark this job as unpaid?")) {
              await markUnpaidAction(assignmentId);
            }
          }}
          type="button"
        >
          <Undo2 className="h-3 w-3" aria-hidden="true" />
          Undo
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border/70 bg-card px-5 text-sm font-semibold text-foreground transition hover:bg-muted"
        onClick={() => setOpen(true)}
        type="button"
      >
        <DollarSign className="h-4 w-4" aria-hidden="true" />
        Mark this job paid
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
      <input name="assignmentId" type="hidden" value={assignmentId} />

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="paymentMethod">
          Payment method
        </label>
        <div className="flex flex-wrap gap-1.5">
          {METHODS.map((m) => (
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1.5 text-sm font-medium transition has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
              key={m.value}
            >
              <input
                className="sr-only"
                name="paymentMethod"
                required
                type="radio"
                value={m.value}
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="paymentReference">
          Reference <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
        </label>
        <input
          className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
          id="paymentReference"
          name="paymentReference"
          placeholder="e.g. Zelle confirmation, check #"
          type="text"
        />
      </div>

      {state.status === "error" && state.message && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
          type="button"
        >
          Cancel
        </button>
        <SubmitButton />
      </div>
    </form>
  );
}
