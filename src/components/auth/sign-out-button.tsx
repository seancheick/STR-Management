"use client";

import { useTransition } from "react";

import { signOutAction } from "@/app/actions/auth";

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="rounded-full border border-border/70 px-4 py-2 text-sm text-muted-foreground transition hover:bg-muted disabled:opacity-60"
      disabled={isPending}
      onClick={() => startTransition(() => { signOutAction(); })}
      type="button"
    >
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
