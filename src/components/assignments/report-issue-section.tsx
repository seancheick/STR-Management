"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { ReportIssueState } from "@/app/(cleaner)/jobs/actions";

type Props = {
  action: (state: ReportIssueState, formData: FormData) => Promise<ReportIssueState>;
  assignmentId: string;
  propertyId: string;
};

const initial: ReportIssueState = { status: "idle", message: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-full bg-destructive px-5 text-sm font-medium text-destructive-foreground transition hover:opacity-90 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Submitting…" : "Report issue"}
    </button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

export function ReportIssueSection({ action, assignmentId, propertyId }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initial);

  // Collapse form after successful submit
  const showForm = open && state.status !== "success";

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Report an issue</h2>
        {state.status === "success" ? (
          <span className="text-sm text-green-600">Issue reported</span>
        ) : (
          <button
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            {open ? "Cancel" : "Report"}
          </button>
        )}
      </div>

      {state.status === "success" && (
        <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
      )}

      {showForm && (
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="propertyId" value={propertyId} />

          {/* Title */}
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="issue-title">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
              id="issue-title"
              name="title"
              placeholder="e.g. Broken towel rail in master bath"
              required
              type="text"
            />
            <FieldError errors={state.fieldErrors?.title} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Type */}
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="issue-type">
                Type
              </label>
              <select
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                defaultValue="other"
                id="issue-type"
                name="issueType"
              >
                <option value="cleaning">Cleaning</option>
                <option value="maintenance">Maintenance</option>
                <option value="damage">Damage</option>
                <option value="inventory">Inventory</option>
                <option value="access">Access</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Severity */}
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="issue-severity">
                Severity
              </label>
              <select
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                defaultValue="medium"
                id="issue-severity"
                name="severity"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="issue-description">
              Description{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
              id="issue-description"
              name="description"
              rows={3}
              placeholder="Describe what you found…"
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
