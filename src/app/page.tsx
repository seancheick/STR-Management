import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  Bell,
  BrainCircuit,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  LogIn,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { EarlyAccessForm } from "@/components/home/early-access-form";
import { HomeSignInCard } from "@/components/home/home-sign-in-card";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getRoleHomePath } from "@/lib/auth/config";

export default async function HomePage() {
  // If already signed in, skip the pitch and drop them at their role home.
  const profile = await getCurrentUserProfile();
  if (profile) {
    redirect(getRoleHomePath(profile.role) as Route);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-card/80 px-6 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-[#f7f5ef]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-base font-semibold tracking-tight">TurnFlow</span>
        </div>
        <div className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          <a className="transition hover:text-foreground" href="#problem">
            The problem
          </a>
          <a className="transition hover:text-foreground" href="#system">
            The system
          </a>
          <a className="transition hover:text-foreground" href="#how">
            How it works
          </a>
          <a className="transition hover:text-foreground" href="#founder">
            Founder
          </a>
        </div>
        <a
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-[#f7f5ef] transition hover:opacity-90"
          href="#login"
        >
          <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
          Login
        </a>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 pt-14 pb-16 md:grid-cols-[1.15fr_0.85fr] md:gap-16 md:pt-20 md:pb-24">
        <div className="flex flex-col items-start gap-6">
          <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Early access · operators only
          </span>
          <h1 className="max-w-xl text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-balance md:text-5xl lg:text-6xl">
            Run your Airbnb like a real operation —{" "}
            <span className="text-primary">without the chaos.</span>
          </h1>
          <p className="max-w-lg text-base leading-7 text-muted-foreground md:text-lg">
            TurnFlow automates cleanings, enforces proof, and keeps your team
            accountable — so you never miss a turnover again.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90"
              href="#access"
            >
              Get early access <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              className="inline-flex h-11 items-center rounded-full border border-border/70 bg-card px-6 text-sm font-medium transition hover:border-primary/30 hover:bg-muted"
              href="#how"
            >
              See how it works
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Built for hosts managing 1–20+ properties · currently onboarding a small group
          </p>
        </div>

        {/* Right: login card */}
        <div id="login" className="flex w-full items-start md:pt-4">
          <div className="w-full">
            <HomeSignInCard />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              New here?{" "}
              <a className="font-medium text-primary hover:underline" href="#access">
                Request access
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── Problem ─────────────────────────────────────────── */}
      <section className="border-y border-border/60 bg-card/40" id="problem">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            The real problem
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
            Managing Airbnb turnovers shouldn&apos;t feel like chaos.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            If you manage Airbnb properties, you already know the pattern.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              "Cleaners miss jobs, ghost your texts, or show up late.",
              "You can't prove the unit was actually turned over.",
              "Every turnover becomes a text-message chain.",
              "Tight turnovers turn into guest complaints.",
            ].map((line) => (
              <li
                className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4 text-sm leading-6"
                key={line}
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-2xl text-base leading-7">
            You end up chasing people instead of running your business.{" "}
            <span className="font-semibold text-foreground">TurnFlow brings structure.</span>
          </p>
        </div>
      </section>

      {/* ── Core value — the system ─────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24" id="system">
        <div className="mb-10 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            The system
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Everything your operation needs — in one place.
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <SystemCard
            icon={<CalendarDays className="h-5 w-5" />}
            title="Auto scheduling from Airbnb & VRBO"
            body="Plug in your iCal. Every guest checkout auto-creates a cleaning job anchored to the property's timezone. No forgotten turnovers."
            bullets={[
              "iCal auto-sync on a daily cron",
              "Tight-turnover warnings (< 6h)",
              "Recurring tasks for deep cleans & filter changes",
            ]}
          />
          <SystemCard
            icon={<Camera className="h-5 w-5" />}
            title="Proof-based cleaning"
            body="Required checklists + before/after photos server-enforced. A unit can't be marked ready without evidence."
            bullets={[
              "Per-category photo requirements",
              "Section-by-section templates",
              "Issue flags require photo on severity ≥ medium",
            ]}
          />
          <SystemCard
            icon={<Users className="h-5 w-5" />}
            title="Team that can't ghost you"
            body="Cleaners accept, decline with a reason, or signal 'running late' — right from the job card."
            bullets={[
              "Per-job chat thread",
              "Auto-reassign on decline",
              "Reliability scores built from real history",
            ]}
          />
          <SystemCard
            icon={<Banknote className="h-5 w-5" />}
            title="Payout reports, not spreadsheets"
            body="Pick a cleaner + a window. See every approved job. Mark line-by-line paid. Export a signed annual statement at tax time."
            bullets={[
              "Per-entry Mark paid toggle",
              "1099 contractor flag + annual PDF",
              "Pending-payout dashboard tile",
            ]}
          />
          <SystemCard
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="Supervisor review queue"
            body="Completed jobs land in a queue. Approve or flag a re-clean with a note — the cleaner sees exactly what to fix."
            bullets={[
              "One-tap approve / reject",
              "Resolution notes required on severity",
              "Re-cleans auto-create linked follow-ups",
            ]}
          />
          <SystemCard
            icon={<KeyRound className="h-5 w-5" />}
            title="Smart-lock ready"
            body="One permanent cleaner code per property on your Yale, August, or Schlage. Per-booking access codes when you need them."
            bullets={[
              "Stale-code rotation reminder",
              "One-tap Copy on cleaner mobile",
              "Per-assignment override supported",
            ]}
          />
          <SystemCard
            icon={<BrainCircuit className="h-5 w-5" />}
            title="Intelligence that doesn't lie"
            body="Reliability scores, property health, on-time rate. Confidence-weighted so new cleaners aren't penalised prematurely."
            bullets={[
              "Cleaner reliability A–F grade",
              "Property health by re-clean rate",
              "Weekly recap card on the dashboard",
            ]}
          />
          <SystemCard
            icon={<Bell className="h-5 w-5" />}
            title="A dashboard that answers one question"
            body='"What matters right now?" One calm sentence at the top. Seven-day calendar. Three tiles. Focus: Today when you want less.'
            bullets={[
              "Header bell surfaces what needs you",
              'Keyboard shortcuts ("g then s", "?")',
              "Slide-in sheet on every assignment",
            ]}
          />
        </div>
      </section>

      {/* ── Product preview — stylised mock calendar ─────────── */}
      <section className="border-y border-border/60 bg-gradient-to-b from-card/60 to-card/30">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="mb-8 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              At a glance
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Your whole week on one screen.
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Property rows across, days on top, pills in between. Orange = guest
              checkout. Green = cleaning due. Red = tight turn. Tap any pill to
              open the slide-in sheet and edit, reassign, or delete.
            </p>
          </div>
          <MockWeekCalendar />
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16 md:py-24" id="how">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Set it up once. Let it run.
          </h2>
        </div>
        <ol className="grid gap-6 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Connect your calendar",
              body: "Paste the iCal URL from Airbnb, VRBO, or Booking. We sync immediately and again daily.",
            },
            {
              step: "02",
              title: "TurnFlow creates the jobs",
              body: "Every guest checkout becomes a cleaning assignment anchored to your property's local time.",
            },
            {
              step: "03",
              title: "Cleaners deliver proof",
              body: "They accept, execute the checklist, upload photos, and submit. You approve or flag a re-clean.",
            },
          ].map((step) => (
            <li
              className="flex flex-col gap-3 rounded-[1.5rem] border border-border/70 bg-card p-6"
              key={step.step}
            >
              <span className="text-5xl font-semibold leading-none text-primary/20">
                {step.step}
              </span>
              <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Differentiation ────────────────────────────────── */}
      <section className="border-y border-border/60 bg-card/40">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Why TurnFlow
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
            Operator-grade, without the enterprise weight.
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <PositionCard
              title="Not a cleaning marketplace"
              body="No bidding, no random strangers. You bring your team, we give them the structure."
            />
            <PositionCard
              title="Not enterprise PMS software"
              body="No two-week onboarding. No 47-tab settings. Built for 1–20 properties, not 200."
            />
            <PositionCard
              title="Built by an operator"
              body="Designed from the ground up by someone running Airbnb properties right now — not a SaaS team guessing at the workflow."
            />
          </div>
        </div>
      </section>

      {/* ── Founder ───────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 py-16 md:py-20" id="founder">
        <div className="rounded-[1.75rem] border border-border/70 bg-card p-8 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Built from the ground up
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Built by someone who actually runs Airbnb properties.
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            TurnFlow started as my own back-office after one too many turnovers
            went sideways. Every feature exists because I felt the pain: a cleaner
            ghosting on a Sunday checkout, a re-clean I couldn&apos;t prove, a
            1099 I had to reconstruct from text messages. If it&apos;s in TurnFlow,
            it&apos;s because it saved me a Sunday night.
          </p>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            I&apos;m onboarding operators one at a time so we can make it work for
            your workflow, not the other way around.
          </p>
        </div>
      </section>

      {/* ── Early access ──────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 pb-20" id="access">
        <div className="rounded-[1.75rem] border border-primary/20 bg-primary px-8 py-10 text-[#f7f5ef] md:px-12 md:py-14">
          <div className="flex flex-col gap-3">
            <Sparkles className="h-6 w-6 text-[#f7f5ef]/80" aria-hidden="true" />
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Get early access to TurnFlow.
            </h2>
            <p className="max-w-xl text-sm leading-6 text-[#f7f5ef]/80">
              We&apos;re onboarding a small group of operators first. Drop your
              email + portfolio size and we&apos;ll personally walk you through
              setup.
            </p>
          </div>
          <div className="mt-6 rounded-2xl bg-[#f7f5ef] p-5 text-foreground">
            <EarlyAccessForm />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-border/60 bg-card/40">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[#f7f5ef]">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            </div>
            <span className="font-semibold tracking-tight text-foreground">TurnFlow</span>
            <span>· Built for short-term rental operators</span>
          </div>
          <div className="flex items-center gap-4">
            <a className="transition hover:text-foreground" href="#login">
              Sign in
            </a>
            <Link className="transition hover:text-foreground" href="/sign-in">
              Standalone sign-in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Reusable bits ────────────────────────────────────────────────────────

function SystemCard({
  icon,
  title,
  body,
  bullets,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  bullets: string[];
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-6 transition hover:border-primary/30 hover:shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      <ul className="mt-1 flex flex-col gap-1.5 text-xs">
        {bullets.map((b) => (
          <li className="flex items-start gap-2 text-muted-foreground" key={b}>
            <CheckCircle2
              className="mt-0.5 h-3 w-3 shrink-0 text-primary/70"
              aria-hidden="true"
            />
            {b}
          </li>
        ))}
      </ul>
    </article>
  );
}

function PositionCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-6">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

// Pure-HTML mocked preview of the dashboard week calendar. Mirrors the real
// product's shape so the landing stays truthful and updates with no asset swap.
function MockWeekCalendar() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const rows: Array<{
    property: string;
    cells: Array<
      null | { kind: "checkout" | "cleaning"; time: string; label?: string; tight?: boolean }
    >;
  }> = [
    {
      property: "Lakeview Loft",
      cells: [
        { kind: "checkout", time: "11:00a" },
        { kind: "cleaning", time: "3:00p", label: "Alice" },
        null,
        null,
        { kind: "checkout", time: "11:00a", tight: true },
        { kind: "cleaning", time: "3:00p", label: "Assign", tight: true },
        null,
      ],
    },
    {
      property: "2BR Providence",
      cells: [
        null,
        null,
        { kind: "checkout", time: "11:00a" },
        { kind: "cleaning", time: "3:00p", label: "Maria" },
        null,
        null,
        { kind: "cleaning", time: "3:00p", label: "Maria" },
      ],
    },
    {
      property: "Downtown Studio",
      cells: [
        { kind: "cleaning", time: "3:00p", label: "Assign" },
        null,
        null,
        { kind: "checkout", time: "11:00a" },
        { kind: "cleaning", time: "3:00p", label: "Ben" },
        null,
        null,
      ],
    },
  ];

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border/60 bg-card px-5 py-3">
        <p className="text-sm font-semibold">This week at a glance</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-orange-400" /> Checkout
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-400" /> Cleaning due
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-400" /> Tight turn
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" style={{ minWidth: "720px" }}>
          <thead>
            <tr className="border-b border-border/60">
              <th className="w-36 bg-card px-4 py-2.5 text-left font-medium uppercase tracking-wider text-muted-foreground">
                Property
              </th>
              {days.map((d, i) => (
                <th
                  className={`px-1 py-2 text-center font-medium uppercase tracking-wider text-muted-foreground ${
                    i === 2 ? "bg-primary/5 text-primary" : ""
                  }`}
                  key={d}
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((row) => (
              <tr key={row.property}>
                <td className="border-r border-border/60 px-4 py-3 align-top">
                  <p className="font-medium leading-snug">{row.property}</p>
                </td>
                {row.cells.map((cell, i) => (
                  <td className="px-1.5 py-1.5 align-top" key={i}>
                    {cell && (
                      <MockPill
                        kind={cell.kind}
                        time={cell.time}
                        label={cell.label}
                        tight={cell.tight}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MockPill({
  kind,
  time,
  label,
  tight,
}: {
  kind: "checkout" | "cleaning";
  time: string;
  label?: string;
  tight?: boolean;
}) {
  const cls = tight
    ? "border-red-300 bg-red-50 text-red-800"
    : kind === "checkout"
      ? "border-orange-200 bg-orange-50 text-orange-800"
      : "border-green-200 bg-green-50 text-green-800";
  const icon =
    kind === "checkout" ? (
      <span className="text-[9px]">↩</span>
    ) : (
      <MessageCircle className="h-2.5 w-2.5" aria-hidden="true" />
    );
  return (
    <span
      className={`flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium ${cls}`}
    >
      {icon}
      <span className="truncate tabular-nums">{time}</span>
      {label && <span className="truncate opacity-70">{label}</span>}
    </span>
  );
}
