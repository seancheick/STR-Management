"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  updateCleanerProfileAction,
  type CleanerProfileActionState,
} from "@/app/(cleaner)/jobs/settings/actions";
import { Button } from "@/components/ui/button";

type CleanerProfileFormProps = {
  profile: {
    email: string;
    full_name: string;
    phone: string | null;
    availability: string | null;
  };
};

const initialState: CleanerProfileActionState = {
  status: "idle",
  message: null,
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "Saving" : "Save settings"}
    </Button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

export function CleanerProfileForm({ profile }: CleanerProfileFormProps) {
  const [state, formAction] = useActionState(updateCleanerProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="fullName">
          Full name
        </label>
        <input
          className="h-12 w-full rounded-xl border border-input bg-muted/60 px-4 text-sm transition"
          defaultValue={profile.full_name}
          id="fullName"
          name="fullName"
          type="text"
        />
        <FieldError errors={state.fieldErrors?.fullName} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          className="h-12 w-full rounded-xl border border-input bg-muted/60 px-4 text-sm text-muted-foreground transition"
          id="email"
          readOnly
          type="email"
          value={profile.email}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="phone">
          Phone
        </label>
        <input
          className="h-12 w-full rounded-xl border border-input bg-muted/60 px-4 text-sm transition"
          defaultValue={profile.phone ?? ""}
          id="phone"
          name="phone"
          type="tel"
        />
        <FieldError errors={state.fieldErrors?.phone} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="availability">
          Address / availability
        </label>
        <textarea
          className="min-h-28 w-full rounded-xl border border-input bg-muted/60 px-4 py-3 text-sm transition"
          defaultValue={profile.availability ?? ""}
          id="availability"
          name="availability"
          rows={4}
        />
        <FieldError errors={state.fieldErrors?.availability} />
      </div>

      {state.message && (
        <p
          className={
            state.status === "success"
              ? "text-sm text-green-700"
              : "text-sm text-destructive"
          }
        >
          {state.message}
        </p>
      )}

      <SaveButton />
    </form>
  );
}
