"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { AssignmentActionState } from "@/app/(admin)/dashboard/assignments/actions";
import type { PropertyRecord } from "@/lib/queries/properties";
import type { TeamMemberRecord } from "@/lib/queries/team";
import type { TemplateRecord } from "@/lib/queries/templates";

type NewAssignmentFormProps = {
  action: (
    state: AssignmentActionState,
    formData: FormData,
  ) => Promise<AssignmentActionState>;
  properties: PropertyRecord[];
  cleaners: TeamMemberRecord[];
  templates: TemplateRecord[];
};

const initialState: AssignmentActionState = { status: "idle", message: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Creating..." : "Create assignment"}
    </button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

export function NewAssignmentForm({
  action,
  properties,
  cleaners,
  templates,
}: NewAssignmentFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  // Default due_at to tomorrow at noon local time
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0);
  const defaultDue = tomorrow.toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm

  return (
    <form action={formAction} className="space-y-8">
      <section className="grid gap-5 md:grid-cols-2">
        {/* Property */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="propertyId">
            Property <span className="text-destructive">*</span>
          </label>
          <select
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="propertyId"
            name="propertyId"
            required
          >
            <option value="">Select a property…</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.city ? ` — ${p.city}` : ""}
              </option>
            ))}
          </select>
          <FieldError errors={state.fieldErrors?.propertyId} />
        </div>

        {/* Cleaner (optional) */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="cleanerId">
            Assign to cleaner{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <select
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="cleanerId"
            name="cleanerId"
          >
            <option value="">Leave unassigned</option>
            {cleaners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
          <FieldError errors={state.fieldErrors?.cleanerId} />
        </div>

        {/* Checklist template */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="templateId">
            Checklist template{" "}
            <span className="font-normal text-muted-foreground">(optional — defaults to property template)</span>
          </label>
          <select
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="templateId"
            name="templateId"
          >
            <option value="">Use property default</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.template_type ? ` (${t.template_type.replace(/_/g, " ")})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Due at */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="dueAt">
            Due at <span className="text-destructive">*</span>
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={defaultDue}
            id="dueAt"
            name="dueAt"
            required
            type="datetime-local"
          />
          <FieldError errors={state.fieldErrors?.dueAt} />
        </div>

        {/* Checkout at */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="checkoutAt">
            Guest checkout{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="checkoutAt"
            name="checkoutAt"
            type="datetime-local"
          />
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="priority">
            Priority
          </label>
          <select
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue="normal"
            id="priority"
            name="priority"
          >
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        {/* Expected duration */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="expectedDurationMin">
            Expected duration (min){" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="expectedDurationMin"
            min="15"
            name="expectedDurationMin"
            step="15"
            type="number"
          />
        </div>

        {/* Fixed payout */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="fixedPayoutAmount">
            Fixed payout ($){" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="fixedPayoutAmount"
            min="0"
            name="fixedPayoutAmount"
            step="0.01"
            type="number"
          />
        </div>
      </section>

      {state.message ? (
        <p
          className={
            state.status === "error" ? "text-sm text-destructive" : "text-sm text-accent"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton />
      </div>
    </form>
  );
}
