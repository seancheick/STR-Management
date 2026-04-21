"use client";

import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  requestEarlyAccessAction,
  type EarlyAccessState,
} from "@/app/actions/early-access";

const initial: EarlyAccessState = { status: "idle", message: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      )}
      Request access
    </button>
  );
}

export function EarlyAccessForm() {
  const [state, action] = useActionState(requestEarlyAccessAction, initial);

  if (state.status === "success" || state.status === "duplicate") {
    return (
      <div className="flex flex-col items-start gap-2 rounded-2xl border border-green-200 bg-green-50 px-5 py-5 text-sm text-green-900">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
          <p className="font-semibold">{state.message}</p>
        </div>
        <p className="text-xs text-green-800/80">
          We&apos;re onboarding a small group of operators first. Keep an eye on your
          inbox — or text the number on the confirmation email if you need in faster.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          autoComplete="email"
          className="h-12 rounded-xl border border-input bg-background px-4 text-sm"
          maxLength={200}
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
        <select
          className="h-12 rounded-xl border border-input bg-background px-4 text-sm"
          defaultValue=""
          name="propertyCount"
        >
          <option value="">How many properties?</option>
          <option value="1-3">1–3 properties</option>
          <option value="4-10">4–10 properties</option>
          <option value="10+">10+ properties</option>
        </select>
        <SubmitButton />
      </div>
      {state.status === "error" && state.message && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
      <p className="text-xs text-muted-foreground">
        No credit card. No spam. We onboard qualified operators first.
      </p>
    </form>
  );
}
