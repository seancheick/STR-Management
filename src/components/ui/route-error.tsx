"use client";

import { AlertTriangle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect } from "react";

/** Shared body for route-segment error.tsx files: keeps the user in the app. */
export function RouteError({
  error,
  reset,
  homeHref,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: Route;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive/70" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This page couldn&apos;t load. Check your connection and try again.
          {error.digest ? ` (Ref: ${error.digest})` : null}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
        <Link
          className="inline-flex h-11 items-center rounded-full border border-border/70 px-5 text-sm font-medium hover:bg-muted"
          href={homeHref}
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
