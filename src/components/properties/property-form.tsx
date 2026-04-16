"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  type PropertyActionState,
} from "@/app/(admin)/dashboard/properties/actions";
import type { PropertyRecord } from "@/lib/queries/properties";

type PropertyFormProps = {
  action: (
    state: PropertyActionState,
    formData: FormData,
  ) => Promise<PropertyActionState>;
  property?: PropertyRecord | null;
  submitLabel: string;
};

const initialPropertyActionState: PropertyActionState = {
  status: "idle",
  message: null,
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

export function PropertyForm({ action, property, submitLabel }: PropertyFormProps) {
  const [state, formAction] = useActionState(action, initialPropertyActionState);

  return (
    <form action={formAction} className="space-y-8">
      <input name="defaultCleanerId" type="hidden" value={property?.default_cleaner_id ?? ""} />

      <section className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="name">
            Property name
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.name ?? ""}
            id="name"
            name="name"
            placeholder="Lakeview Loft"
            required
          />
          <FieldError errors={state.fieldErrors?.name} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="addressLine1">
            Address
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.address_line_1 ?? ""}
            id="addressLine1"
            name="addressLine1"
            placeholder="123 Demo Street"
          />
          <FieldError errors={state.fieldErrors?.addressLine1} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="city">
            City
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.city ?? ""}
            id="city"
            name="city"
            placeholder="Austin"
          />
          <FieldError errors={state.fieldErrors?.city} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="state">
            State
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm uppercase"
            defaultValue={property?.state ?? ""}
            id="state"
            name="state"
            placeholder="TX"
          />
          <FieldError errors={state.fieldErrors?.state} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="postalCode">
            Postal code
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.postal_code ?? ""}
            id="postalCode"
            name="postalCode"
            placeholder="78701"
          />
          <FieldError errors={state.fieldErrors?.postalCode} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="bedrooms">
            Bedrooms
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.bedrooms ?? ""}
            id="bedrooms"
            min="0"
            name="bedrooms"
            step="1"
            type="number"
          />
          <FieldError errors={state.fieldErrors?.bedrooms} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="bathrooms">
            Bathrooms
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.bathrooms ?? ""}
            id="bathrooms"
            min="0"
            name="bathrooms"
            step="0.5"
            type="number"
          />
          <FieldError errors={state.fieldErrors?.bathrooms} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="defaultCleanPrice">
            Default clean price
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.default_clean_price ?? ""}
            id="defaultCleanPrice"
            min="0"
            name="defaultCleanPrice"
            step="0.01"
            type="number"
          />
          <FieldError errors={state.fieldErrors?.defaultCleanPrice} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="difficultyScore">
            Difficulty score
          </label>
          <input
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue={property?.difficulty_score ?? ""}
            id="difficultyScore"
            max="5"
            min="1"
            name="difficultyScore"
            step="1"
            type="number"
          />
          <FieldError errors={state.fieldErrors?.difficultyScore} />
        </div>
      </section>

      <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
        <input
          defaultChecked={property?.active ?? true}
          name="active"
          type="checkbox"
          value="on"
        />
        <span className="text-sm text-foreground">Property is active</span>
      </label>

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
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
