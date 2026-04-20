"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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

export function ResetPasswordForm() {
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

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
