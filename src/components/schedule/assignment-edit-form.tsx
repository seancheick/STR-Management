"use client";

import { AlertCircle, Clock, Loader2, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import {
  cancelAssignmentAction,
  rescheduleAssignmentAction,
  type CancelState,
  type RescheduleState,
} from "@/app/(admin)/dashboard/schedule/actions";
import {
  formatTurnoverWindow,
  isTightTurnover,
  tightTurnoverMinutes,
} from "@/lib/domain/assignments";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { showToast } from "@/components/ui/toast";

/**
 * Minimal shape an assignment needs to be editable.
 * Both AssignmentScheduleRecord and AssignmentListRecord satisfy this.
 */
export type EditableAssignment = {
  id: string;
  status: string;
  priority: string;
  checkout_at: string | null;
  due_at: string;
  next_checkin_at: string | null;
  cleaner_id: string | null;
  expected_duration_min: number | null;
  fixed_payout_amount: number | null;
  access_code?: string | null;
};

const rescheduleInitial: RescheduleState = { status: "idle", message: null };
const cancelInitial: CancelState = { status: "idle", message: null };

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type AssignmentEditFormProps = {
  assignment: EditableAssignment;
  cleaners: TeamMemberRecord[];
  onCancel: () => void;
  onSaved: () => void;
  onDeleted: () => void;
};

export function AssignmentEditForm({
  assignment,
  cleaners,
  onCancel,
  onSaved,
  onDeleted,
}: AssignmentEditFormProps) {
  const [state, formAction, isPending] = useActionState(
    rescheduleAssignmentAction,
    rescheduleInitial,
  );
  const [cancelState, cancelFormAction, isCancelling] = useActionState(
    cancelAssignmentAction,
    cancelInitial,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      showToast(state.message ?? "Assignment updated.");
      onSaved();
    } else if (state.status === "error" && state.message) {
      showToast(state.message, "error");
    }
  }, [state, onSaved]);

  useEffect(() => {
    if (cancelState.status === "success") {
      showToast(cancelState.message ?? "Assignment deleted.");
      onDeleted();
    } else if (cancelState.status === "error" && cancelState.message) {
      showToast(cancelState.message, "error");
    }
  }, [cancelState, onDeleted]);

  const editableStatuses = ["unassigned", "assigned", "confirmed", "needs_reclean"];
  const canDelete = editableStatuses.includes(assignment.status);
  const isLocked = !editableStatuses.includes(assignment.status);
  const tight = isTightTurnover(assignment.checkout_at, assignment.next_checkin_at);
  const tightWindow = tight
    ? formatTurnoverWindow(tightTurnoverMinutes(assignment.checkout_at, assignment.next_checkin_at))
    : null;

  return (
    <div className="flex flex-col gap-4">
      {tight && (
        <div
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
          role="alert"
        >
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Tight turn — {tightWindow} window.</strong>{" "}
            Confirm cleaner is aware and on-site by checkout.
          </span>
        </div>
      )}

      {isLocked && (
        <div
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            This job is <strong className="font-semibold capitalize">{assignment.status.replace(/_/g, " ")}</strong>.
            Cancel and recreate if timing needs to change.
          </span>
        </div>
      )}

      <form
        action={(fd) => {
          // datetime-local values come back as local wall-clock. Convert to real
          // ISO so Postgres doesn't stamp them as UTC.
          for (const field of ["dueAt", "checkoutAt"]) {
            const raw = fd.get(field);
            if (typeof raw === "string" && raw.length > 0) {
              const iso = new Date(raw).toISOString();
              if (!Number.isNaN(Date.parse(iso))) fd.set(field, iso);
            }
          }
          return formAction(fd);
        }}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="assignmentId" value={assignment.id} />

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Guest checkout</span>
            <input
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm disabled:opacity-60"
              defaultValue={toDatetimeLocal(assignment.checkout_at)}
              disabled={isLocked}
              name="checkoutAt"
              type="datetime-local"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Next check-in</span>
            <input
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm disabled:opacity-60"
              defaultValue={toDatetimeLocal(assignment.due_at)}
              disabled={isLocked}
              name="dueAt"
              required
              type="datetime-local"
            />
          </label>
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Defaults: <span className="font-medium">11 AM</span> checkout, <span className="font-medium">3 PM</span> next check-in
          — the standard Airbnb/VRBO times your feed uses. Override if your listing is different.
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Cleaner</span>
          <select
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm disabled:opacity-60"
            defaultValue={assignment.cleaner_id ?? ""}
            disabled={isLocked}
            name="cleanerId"
          >
            <option value="">Unassigned</option>
            {cleaners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Priority</span>
            <select
              className="h-10 rounded-xl border border-input bg-background px-2 text-sm"
              defaultValue={assignment.priority}
              name="priority"
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Duration (min)</span>
            <input
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
              defaultValue={assignment.expected_duration_min ?? ""}
              min="15"
              name="expectedDurationMin"
              step="15"
              type="number"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Payout ($)</span>
            <input
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
              defaultValue={
                assignment.fixed_payout_amount !== null
                  ? Number(assignment.fixed_payout_amount)
                  : ""
              }
              min="0"
              name="fixedPayoutAmount"
              step="0.01"
              type="number"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Door / gate code <span className="opacity-60">(visible to cleaner only)</span>
          </span>
          <input
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-mono"
            defaultValue={assignment.access_code ?? ""}
            maxLength={64}
            name="accessCode"
            placeholder="e.g. 4287 or #1234"
            type="text"
          />
        </label>

        <div className="mt-1 flex items-center gap-2">
          <button
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60"
            disabled={isPending || isLocked}
            type="submit"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save changes
          </button>
          <button
            className="inline-flex h-9 items-center justify-center rounded-full border border-border/70 px-4 text-sm font-medium transition hover:bg-muted"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>

      {canDelete && (
        <div className="border-t border-border/60 pt-3">
          {!confirmDelete ? (
            <button
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-red-200 text-sm font-medium text-red-700 transition hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete assignment
            </button>
          ) : (
            <form
              action={cancelFormAction}
              className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/50 p-3"
            >
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <p className="text-xs text-red-800">
                This removes the job from the schedule and the cleaner&apos;s app. Continue?
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full bg-red-600 px-3 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                  disabled={isCancelling}
                  type="submit"
                >
                  {isCancelling && <Loader2 className="h-3 w-3 animate-spin" />}
                  Yes, delete
                </button>
                <button
                  className="inline-flex h-8 items-center justify-center rounded-full border border-border/70 bg-background px-3 text-xs font-medium transition hover:bg-muted"
                  onClick={() => setConfirmDelete(false)}
                  type="button"
                >
                  Keep it
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
