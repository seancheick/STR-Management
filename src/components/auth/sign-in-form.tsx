"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  getRememberedEmail,
  requestBrowserPasswordSave,
  saveRememberedEmail,
} from "@/lib/auth/remembered-credentials";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const signInSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type SignInValues = z.infer<typeof signInSchema>;

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email."),
});

type SignInFormProps = {
  redirectTo?: string;
};

export function SignInForm({ redirectTo }: SignInFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [rememberCredentials, setRememberCredentials] = useState(true);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetStatus, setResetStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });
  const forgotForm = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const normalizedRedirectTo = useMemo(() => {
    if (typeof redirectTo === "string" && redirectTo.startsWith("/jobs")) {
      return "/jobs";
    }

    return "/dashboard";
  }, [redirectTo]);

  useEffect(() => {
    const rememberedEmail = getRememberedEmail(window.localStorage);
    if (rememberedEmail) {
      form.setValue("email", rememberedEmail);
      forgotForm.setValue("email", rememberedEmail);
    }
  }, [forgotForm, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword(values);

    if (error) {
      setServerError(error.message);
      return;
    }

    saveRememberedEmail(values.email, rememberCredentials, window.localStorage);
    await requestBrowserPasswordSave({
      email: values.email,
      password: values.password,
      enabled: rememberCredentials,
    });

    router.push(normalizedRedirectTo as Route);
    router.refresh();
  });

  const onForgotPassword = forgotForm.handleSubmit(async (values) => {
    setResetStatus(null);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setResetStatus({ type: "error", message: error.message });
      return;
    }

    saveRememberedEmail(values.email, rememberCredentials, window.localStorage);
    setResetStatus({
      type: "success",
      message: "Password reset email sent. Open the link in that email to choose a new password.",
    });
  });

  return (
    <div className="space-y-5">
      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="h-12 w-full rounded-xl border border-input bg-muted/60 px-4 text-sm transition"
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="h-12 w-full rounded-xl border border-input bg-muted/60 px-4 text-sm transition"
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p className="text-sm text-destructive">
              {form.formState.errors.password.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              checked={rememberCredentials}
              className="h-4 w-4 rounded border-input"
              onChange={(event) => setRememberCredentials(event.target.checked)}
              type="checkbox"
            />
            Save email and browser password
          </label>
          <button
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => {
              const email = form.getValues("email");
              if (email) forgotForm.setValue("email", email);
              setForgotOpen((value) => !value);
              setResetStatus(null);
            }}
            type="button"
          >
            Forgot password?
          </button>
        </div>

        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

        <Button className="w-full" disabled={form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting ? (
            <>
              <LoaderCircle className="animate-spin" />
              Signing in
            </>
          ) : (
            "Sign In"
          )}
        </Button>
      </form>

      {forgotOpen && (
        <form
          className="rounded-2xl border border-border bg-muted/40 p-4"
          onSubmit={onForgotPassword}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="reset-email">
              Reset email
            </label>
            <input
              autoComplete="email"
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm transition"
              id="reset-email"
              type="email"
              {...forgotForm.register("email")}
            />
            {forgotForm.formState.errors.email ? (
              <p className="text-sm text-destructive">
                {forgotForm.formState.errors.email.message}
              </p>
            ) : null}
          </div>

          {resetStatus ? (
            <p
              className={
                resetStatus.type === "success"
                  ? "mt-3 text-sm text-green-700"
                  : "mt-3 text-sm text-destructive"
              }
            >
              {resetStatus.message}
            </p>
          ) : null}

          <Button
            className="mt-4 w-full"
            disabled={forgotForm.formState.isSubmitting}
            type="submit"
            variant="secondary"
          >
            {forgotForm.formState.isSubmitting ? (
              <>
                <LoaderCircle className="animate-spin" />
                Sending reset link
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
