"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { AddCalendarSourceState } from "@/app/(admin)/dashboard/calendar/actions";
import type { PropertyRecord } from "@/lib/queries/properties";

type Props = {
  action: (
    state: AddCalendarSourceState,
    formData: FormData,
  ) => Promise<AddCalendarSourceState>;
  properties: PropertyRecord[];
};

const initial: AddCalendarSourceState = { status: "idle", message: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Adding…" : "Add source"}
    </button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

export function AddCalendarSourceForm({ action, properties }: Props) {
  const [state, formAction] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor="cal-property">
            Property <span className="text-destructive">*</span>
          </label>
          <select
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="cal-property"
            name="propertyId"
            required
          >
            <option value="">Select a property…</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.city ? ` — ${p.city}` : ""}
              </option>
            ))}
          </select>
          <FieldError errors={state.fieldErrors?.propertyId} />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="cal-name">
            Source name <span className="text-destructive">*</span>
          </label>
          <input
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="cal-name"
            name="name"
            placeholder="e.g. Airbnb — Lakeview Loft"
            required
            type="text"
          />
          <FieldError errors={state.fieldErrors?.name} />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="cal-platform">
            Platform
          </label>
          <select
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue="airbnb"
            id="cal-platform"
            name="platform"
          >
            <option value="airbnb">Airbnb</option>
            <option value="vrbo">VRBO</option>
            <option value="booking">Booking.com</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor="cal-url">
            iCal URL <span className="text-destructive">*</span>
          </label>
          <input
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm font-mono text-xs"
            id="cal-url"
            name="icalUrl"
            placeholder="https://www.airbnb.com/calendar/ical/…"
            required
            type="url"
          />
          <FieldError errors={state.fieldErrors?.icalUrl} />
        </div>
      </div>

      {state.message && (
        <p
          className={
            state.status === "error" ? "text-sm text-destructive" : "text-sm text-green-600"
          }
        >
          {state.message}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
