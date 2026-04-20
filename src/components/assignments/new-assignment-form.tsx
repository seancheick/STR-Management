"use client";

import { useActionState, useState } from "react";
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

// Chips: how many hours after checkout until next guest checks in
const DUE_CHIPS = [
  {
    label: "24 hours",
    key: "24h",
    hours: 24,
  },
  {
    label: "48 hours",
    key: "48h",
    hours: 48,
  },
  {
    label: "72 hours",
    key: "72h",
    hours: 72,
  },
] as const;

function addHours(isoString: string, hours: number): Date {
  const d = new Date(isoString);
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d;
}

type ChipKey = (typeof DUE_CHIPS)[number]["key"] | null;

function toDatetimeLocal(d: Date) {
  // yyyy-MM-ddTHH:mm in local time
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-[#f7f5ef] transition hover:opacity-95 disabled:opacity-60"
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

  // Default checkout: tomorrow at 11 AM (standard Airbnb checkout)
  const [checkoutVal, setCheckoutVal] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(11, 0, 0, 0);
    return toDatetimeLocal(d);
  });
  const [activeChip, setActiveChip] = useState<ChipKey>(null);
  const [dueVal, setDueVal] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(15, 0, 0, 0); // 3 PM — standard check-in time
    return toDatetimeLocal(d);
  });

  function handleCheckoutChange(val: string) {
    setCheckoutVal(val);
    if (activeChip && val) {
      const chip = DUE_CHIPS.find((c) => c.key === activeChip);
      if (chip) setDueVal(toDatetimeLocal(addHours(val, chip.hours)));
    }
  }

  function handleChipClick(chip: (typeof DUE_CHIPS)[number]) {
    if (!checkoutVal) return;
    setActiveChip(chip.key);
    setDueVal(toDatetimeLocal(addHours(checkoutVal, chip.hours)));
  }

  return (
    <form
      action={(formData) => {
        // datetime-local sends "YYYY-MM-DDTHH:MM" with no TZ. The browser
        // means *local* time — convert to a real ISO so Postgres doesn't
        // accidentally stamp it as UTC and surface hours off for the user.
        for (const field of ["dueAt", "checkoutAt"]) {
          const raw = formData.get(field);
          if (typeof raw === "string" && raw.length > 0) {
            const iso = new Date(raw).toISOString();
            if (!Number.isNaN(Date.parse(iso))) formData.set(field, iso);
          }
        }
        return formAction(formData);
      }}
      className="space-y-8"
    >
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

        {/* Turnover window: checkout + check-in side by side */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="checkoutAt">
            Guest checkout
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="checkoutAt"
            name="checkoutAt"
            type="datetime-local"
            value={checkoutVal}
            onChange={(e) => handleCheckoutChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Typically 11 AM</p>
        </div>

        {/* Next guest check-in — with quick chips */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="dueAt">
            Next guest check-in <span className="text-destructive">*</span>
          </label>

          {/* Quick chips */}
          <div className="flex flex-wrap gap-2">
            {DUE_CHIPS.map((chip) => {
              const isActive = activeChip === chip.key;
              const disabled = !checkoutVal;
              return (
                <button
                  key={chip.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleChipClick(chip)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    isActive
                      ? "border-primary bg-primary text-[#f7f5ef]"
                      : disabled
                        ? "border-border/50 bg-muted/40 text-muted-foreground/50 cursor-not-allowed"
                        : "border-border/70 bg-card text-foreground hover:border-primary/40 hover:bg-primary/5"
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
            <span className="self-center text-xs text-muted-foreground">
              {checkoutVal ? "or pick manually below" : "— enter guest checkout first"}
            </span>
          </div>

          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="dueAt"
            name="dueAt"
            required
            type="datetime-local"
            value={dueVal}
            onChange={(e) => {
              setDueVal(e.target.value);
              setActiveChip(null); // manual override clears chip
            }}
          />
          <FieldError errors={state.fieldErrors?.dueAt} />
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
            state.status === "error" ? "text-sm text-destructive" : "text-sm font-medium text-green-700"
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
