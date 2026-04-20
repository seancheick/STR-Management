"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  getRememberedEmail,
  saveRememberedEmail,
} from "@/lib/auth/remembered-credentials";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email."),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    const remembered = getRememberedEmail(window.localStorage);
    if (remembered) form.setValue("email", remembered);
  }, [form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setStatus(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setStatus({ type: "error", message: error.message });
      return;
    }

    saveRememberedEmail(values.email, true, window.localStorage);
    setStatus({
      type: "success",
      message: `We sent a reset link to ${values.email}. Open it to choose a new password.`,
    });
    form.reset({ email: values.email });
  });

  if (status?.type === "success") {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-600" aria-hidden="true" />
          <p className="text-sm leading-6 text-green-900">{status.message}</p>
          <p className="text-xs text-green-800/70">
            Didn&apos;t get it? Check spam, or send again below.
          </p>
        </div>
        <Button
          className="w-full"
          onClick={() => setStatus(null)}
          type="button"
          variant="secondary"
        >
          Send another link
        </Button>
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
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="forgot-email">
          Email
        </label>
        <input
          autoComplete="email"
          autoFocus
          className="h-12 w-full rounded-xl border border-input bg-muted/60 px-4 text-sm transition"
          id="forgot-email"
          type="email"
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.email.message}
          </p>
        ) : null}
      </div>

      {status?.type === "error" ? (
        <p className="text-sm text-destructive">{status.message}</p>
      ) : null}

      <Button className="w-full" disabled={form.formState.isSubmitting} type="submit">
        {form.formState.isSubmitting ? (
          <>
            <LoaderCircle className="animate-spin" />
            Sending reset link
          </>
        ) : (
          "Send reset link"
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
