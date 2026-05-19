"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle } from "lucide-react";

import { signUpAsHostAction, signUpInitial } from "@/app/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-95 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Creating your account…" : "Create my TurnFlow account"}
    </button>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAsHostAction, signUpInitial);

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "error" && state.message && (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="fullName">
          Your name
        </label>
        <input
          autoComplete="name"
          className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
          id="fullName"
          name="fullName"
          placeholder="Alex Rivera"
          required
          type="text"
        />
        <FieldError messages={state.fieldErrors?.fullName} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
          id="email"
          name="email"
          placeholder="alex@coastalstays.com"
          required
          type="email"
        />
        <FieldError messages={state.fieldErrors?.email} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="new-password"
          className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
          id="password"
          minLength={8}
          name="password"
          placeholder="At least 8 characters"
          required
          type="password"
        />
        <FieldError messages={state.fieldErrors?.password} />
      </div>

      <SubmitButton />

      <p className="text-center text-xs leading-5 text-muted-foreground">
        By creating an account you get your own private TurnFlow workspace. You can
        invite your cleaning team after you sign in.
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-medium text-primary hover:underline" href="/sign-in">
          Sign in
        </Link>
      </p>
    </form>
  );
}
