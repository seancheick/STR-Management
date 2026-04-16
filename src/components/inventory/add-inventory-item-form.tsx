"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { AddInventoryItemState } from "@/app/(admin)/dashboard/properties/[propertyId]/inventory/actions";

type Props = {
  action: (
    state: AddInventoryItemState,
    formData: FormData,
  ) => Promise<AddInventoryItemState>;
  propertyId: string;
};

const initial: AddInventoryItemState = { status: "idle", message: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Adding…" : "Add item"}
    </button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

export function AddInventoryItemForm({ action, propertyId }: Props) {
  const [state, formAction] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="propertyId" value={propertyId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor="inv-name">
            Item name <span className="text-destructive">*</span>
          </label>
          <input
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="inv-name"
            name="name"
            placeholder="e.g. Toilet paper"
            required
            type="text"
          />
          <FieldError errors={state.fieldErrors?.name} />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="inv-category">
            Category{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
            id="inv-category"
            name="category"
            placeholder="e.g. Bathroom supplies"
            type="text"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="inv-unit">
            Unit
          </label>
          <input
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue="roll"
            id="inv-unit"
            name="unit"
            placeholder="roll, bottle, set…"
            type="text"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="inv-qty">
            Current quantity
          </label>
          <input
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue="0"
            id="inv-qty"
            min="0"
            name="currentQuantity"
            type="number"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="inv-threshold">
            Reorder threshold
          </label>
          <input
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
            defaultValue="2"
            id="inv-threshold"
            min="0"
            name="reorderThreshold"
            type="number"
          />
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
