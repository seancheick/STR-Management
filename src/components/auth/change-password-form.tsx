"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { changePassword } from "@/lib/auth/change-password";

export function ChangePasswordForm() {
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const current = String(values.get("currentPassword") ?? "");
    const password = String(values.get("password") ?? "");
    const confirmation = String(values.get("confirmation") ?? "");
    setFeedback(null);
    if (password !== confirmation) {
      setFeedback({ error: true, message: "The new passwords don’t match. Please check them." });
      return;
    }
    if (current === password) {
      setFeedback({ error: true, message: "Choose a new password that’s different from your current one." });
      return;
    }
    setBusy(true);
    try {
      const { error } = await changePassword(current, password);
      if (error) {
        setFeedback({ error: true, message: error });
        return;
      }
      form.reset();
      setShow(false);
      setFeedback({ error: false, message: "Password changed. Use your new password next time you sign in." });
    } catch {
      setFeedback({ error: true, message: "We couldn’t change your password. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6" aria-labelledby="change-password-heading">
      <h2 id="change-password-heading" className="text-base font-semibold">Change password</h2>
      <p className="mt-1 text-sm text-muted-foreground">Update the password you use to sign in.</p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4 disabled:opacity-60">
          {[
            { name: "currentPassword", label: "Current password", autocomplete: "current-password" },
            { name: "password", label: "New password", autocomplete: "new-password" },
            { name: "confirmation", label: "Confirm new password", autocomplete: "new-password" },
          ].map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <label htmlFor={field.name} className="text-sm font-medium">{field.label}</label>
              <input id={field.name} name={field.name} autoComplete={field.autocomplete}
                type={show ? "text" : "password"} required minLength={field.name === "currentPassword" ? undefined : 8}
                aria-describedby={field.name === "password" ? "password-help" : undefined}
                className="min-h-12 w-full min-w-0 rounded-xl border border-input bg-background px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
              {field.name === "password" && <p id="password-help" className="text-xs text-muted-foreground">Use at least 8 characters.</p>}
            </div>
          ))}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} className="h-5 w-5 accent-primary" />
            Show passwords
          </label>
          <button type="submit" className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 sm:self-start" >
            {busy ? "Changing password…" : "Change password"}
          </button>
        </fieldset>
        {feedback && <p role={feedback.error ? "alert" : "status"} className={`text-sm ${feedback.error ? "text-destructive" : "text-primary"}`}>{feedback.message}</p>}
        <Link href="/forgot-password" className="flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4">Forgot your current password?</Link>
      </form>
    </section>
  );
}
