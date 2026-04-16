"use client";

import { useActionState } from "react";

import { inviteTeamMemberAction } from "@/app/(admin)/dashboard/team/actions";

const ROLES = ["cleaner", "supervisor", "admin"];

export function InviteForm() {
  const [state, action, isPending] = useActionState(inviteTeamMemberAction, { error: null });

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}
      {!state.error && state.error === null && (
        // success state handled by revalidation — form resets naturally
        null
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="full_name">
            Full name <span className="text-destructive">*</span>
          </label>
          <input
            className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            id="full_name"
            name="full_name"
            placeholder="Jane Smith"
            required
            type="text"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="email">
            Email <span className="text-destructive">*</span>
          </label>
          <input
            className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            id="email"
            name="email"
            placeholder="jane@example.com"
            required
            type="email"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="role">Role</label>
          <select
            className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            id="role"
            name="role"
            defaultValue="cleaner"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        className="self-start rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Sending invite…" : "Send invite"}
      </button>
      <p className="text-xs text-muted-foreground">
        The team member will receive a magic link to set up their account.
      </p>
    </form>
  );
}
