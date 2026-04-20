"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

type SessionState = "checking" | "ready" | "missing";

export function ResetPasswordForm() {
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSessionState(data.session ? "ready" : "missing");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setSessionState("ready");
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    setStatus(null);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });

    if (error) {
      setStatus({ type: "error", message: error.message });
      return;
    }

    form.reset();
    setStatus({
      type: "success",
      message: "Password updated. You can sign in with the new password.",
    });
  });

  if (sessionState === "checking") {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        Verifying reset link…
      </div>
    );
  }

  if (sessionState === "missing") {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">Reset link expired or already used.</p>
            <p className="text-xs text-amber-800/80">
              Password reset links can only be opened once, in the same browser that
              requested them. Request a fresh link to continue.
            </p>
          </div>
        </div>
        <Link
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-[#f7f5ef]"
          href={"/forgot-password" as Route}
        >
          Request a new reset link
        </Link>
        <Link
          className="block text-center text-sm font-medium text-primary underline-offset-2 hover:underline"
          href="/sign-in"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <input
        aria-hidden="true"
        autoComplete="username"
        className="sr-only"
        readOnly
        tabIndex={-1}
        type="text"
        value=""
      />

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="new-password">
          New password
        </label>
        <input
          autoComplete="new-password"
          className="h-12 w-full rounded-xl border border-input bg-muted/60 px-4 text-sm transition"
          id="new-password"
          type="password"
          {...form.register("password")}
        />
        {form.formState.errors.password ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.password.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="confirm-password">
          Confirm password
        </label>
        <input
          autoComplete="new-password"
          className="h-12 w-full rounded-xl border border-input bg-muted/60 px-4 text-sm transition"
          id="confirm-password"
          type="password"
          {...form.register("confirmPassword")}
        />
        {form.formState.errors.confirmPassword ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.confirmPassword.message}
          </p>
        ) : null}
      </div>

      {status ? (
        <p
          className={
            status.type === "success"
              ? "text-sm text-green-700"
              : "text-sm text-destructive"
          }
        >
          {status.message}
        </p>
      ) : null}

      <Button className="w-full" disabled={form.formState.isSubmitting} type="submit">
        {form.formState.isSubmitting ? (
          <>
            <LoaderCircle className="animate-spin" />
            Updating password
          </>
        ) : (
          "Update password"
        )}
      </Button>

      <Link
        className="block text-center text-sm font-medium text-primary underline-offset-2 hover:underline"
        href="/sign-in"
      >
        Back to sign in
      </Link>
    </form>
  );
}
