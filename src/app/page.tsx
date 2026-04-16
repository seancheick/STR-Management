import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-12">
      <section className="rounded-[2rem] border border-border/60 bg-card/80 p-8 shadow-sm backdrop-blur md:p-12">
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
          Sprint 1 Foundation
        </p>
        <div className="grid gap-8 md:grid-cols-[1.5fr_1fr]">
          <div className="space-y-5">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
              Proof-based Airbnb operations for owners, supervisors, and cleaners.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              This scaffold establishes the App Router shell, Supabase auth foundation,
              route groups, and the first database migration for Sprint 1.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/sign-in">Sign In</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard">Admin Preview</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/jobs">Cleaner Preview</Link>
              </Button>
            </div>
          </div>
          <div className="rounded-[1.5rem] bg-primary p-6 text-primary-foreground">
            <p className="text-sm uppercase tracking-[0.25em] text-primary-foreground/70">
              Critical Path
            </p>
            <ul className="mt-6 space-y-3 text-sm leading-6 md:text-base">
              <li>Auth with route protection</li>
              <li>Properties and checklist templates</li>
              <li>Assignments and proof validation</li>
              <li>Cleaner mobile execution flow</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

