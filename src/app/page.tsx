import type { Route } from "next";
import Link from "next/link";
import {
  CalendarDays,
  CheckSquare2,
  ClipboardList,
  Camera,
  Users,
  BarChart3,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Proof-based checklists",
    description: "Every job requires signed-off checklist items before it closes. No shortcuts.",
  },
  {
    icon: Camera,
    title: "Photo documentation",
    description: "Cleaners upload before/after photos per category. Evidence is attached to every job.",
  },
  {
    icon: CalendarDays,
    title: "Auto-scheduling from Airbnb",
    description: "iCal sync pulls checkout dates from Airbnb and VRBO and creates assignments automatically.",
  },
  {
    icon: Users,
    title: "Team management",
    description: "Invite cleaners, assign supervisors, track payouts and performance in one place.",
  },
  {
    icon: CheckSquare2,
    title: "Supervisor review queue",
    description: "Completed jobs go to a review queue. Approve or flag for re-clean with one tap.",
  },
  {
    icon: BarChart3,
    title: "Payout tracking",
    description: "Generate payout batches, export CSV statements, and give cleaners visibility into their earnings.",
  },
];

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-card/80 px-6 backdrop-blur">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="font-semibold tracking-tight">STR Manager</span>
        </div>
        <Link
          href={"/sign-in" as Route}
          className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-[#f7f5ef] transition hover:opacity-90"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 py-20 text-center md:py-28">
        <span className="rounded-full border border-primary/25 bg-primary/12 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-primary">
          Short-term rental operations
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-balance md:text-6xl">
          Run your properties like a professional operator
        </h1>
        <p className="max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
          Assign cleaners, enforce checklist proof, sync your Airbnb calendar, and
          track payouts — all in one place built for STR owners.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={"/sign-in" as Route}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90"
          >
            Go to dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href={"/sign-in?redirectTo=/jobs" as Route}
            className="inline-flex h-11 items-center rounded-full border border-border/70 bg-card px-6 text-sm font-medium transition hover:border-primary/30 hover:bg-muted"
          >
            I&apos;m a cleaner
          </Link>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border/60 bg-card/60">
        <div className="mx-auto grid max-w-5xl grid-cols-3 divide-x divide-border/60 px-6">
          {[
            { value: "100%", label: "Proof-gated completions" },
            { value: "Auto", label: "iCal sync scheduling" },
            { value: "0 gaps", label: "Missed turnover tracking" },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center gap-1 py-6 text-center">
              <span className="text-2xl font-bold tabular-nums tracking-tight text-primary md:text-3xl">
                {value}
              </span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16 md:py-20">
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Everything your operation needs
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Built for operators managing 1–20 properties without a full-time ops team.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition duration-200 hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-16">
        <div className="rounded-[1.75rem] border border-primary/20 bg-primary p-8 text-center md:p-12">
          <h2 className="text-2xl font-semibold tracking-tight text-[#f7f5ef] md:text-3xl">
            Ready to get started?
          </h2>
          <p className="mt-2 text-sm text-[#f7f5ef]/80 md:text-base">
            Sign in to your owner dashboard or access your assigned jobs.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={"/sign-in" as Route}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#f7f5ef] px-6 text-sm font-semibold text-[#16423c] transition hover:opacity-90"
            >
              Owner / Admin sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={"/sign-in?redirectTo=/jobs" as Route}
              className="inline-flex h-11 items-center rounded-full border border-[#f7f5ef]/30 px-6 text-sm font-medium text-[#f7f5ef] transition hover:bg-[#f7f5ef]/10"
            >
              Cleaner sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 px-6 py-6 text-center text-xs text-muted-foreground">
        STR Manager · Built for short-term rental operators
      </footer>
    </main>
  );
}
