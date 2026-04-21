import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  KeyRound,
  Link2,
  Lock,
  LogIn,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

import { EarlyAccessForm } from "@/components/home/early-access-form";
import { HomeSignInCard } from "@/components/home/home-sign-in-card";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getRoleHomePath } from "@/lib/auth/config";

export default async function HomePage() {
  const profile = await getCurrentUserProfile();
  if (profile) {
    redirect(getRoleHomePath(profile.role) as Route);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-card/85 px-6 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-[#f7f5ef]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-base font-semibold tracking-tight">TurnFlow</span>
        </div>
        <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
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
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-card px-4 text-xs font-medium text-foreground transition hover:bg-muted"
          href="#login"
        >
          <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
          Login
        </a>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 pt-14 pb-16 md:grid-cols-[1.25fr_0.9fr] md:gap-14 md:pt-20 md:pb-24">
        <div className="flex flex-col items-start gap-6">
          <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Early access · operators only
          </span>
          <h1 className="max-w-xl text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-balance md:text-5xl lg:text-[3.5rem]">
            Run your Airbnb like a real operation —{" "}
            <span className="text-primary">without the chaos.</span>
          </h1>
          <p className="max-w-lg text-base leading-7 text-muted-foreground md:text-lg">
            TurnFlow automates cleanings, enforces proof, and keeps your team
            accountable — so you never miss a turnover again.
          </p>

          {/* Primary action dominates; secondary is a text link */}
          <div className="flex flex-wrap items-center gap-3">
            <a
              className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-sm font-semibold text-[#f7f5ef] shadow-md shadow-primary/15 transition hover:opacity-90"
              href="#access"
            >
              Get early access <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              className="inline-flex h-12 items-center gap-1 px-2 text-sm font-medium text-foreground transition hover:text-primary"
              href="#how"
            >
              See how it works →
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Built for hosts managing 1–20+ properties · onboarding a small group this month
          </p>
        </div>

        {/* Right: secondary login card — smaller, less contrast */}
        <div id="login" className="flex w-full items-start md:pt-6">
          <div className="w-full">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Already using TurnFlow?
            </p>
            <HomeSignInCard />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              New here?{" "}
              <a className="font-medium text-primary hover:underline" href="#access">
                Request access →
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
            If you manage short-term rentals, you know this pattern.
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
            <span className="font-semibold text-foreground">
              TurnFlow brings structure.
            </span>
          </p>
        </div>
      </section>

      {/* ── The system — FOUR buckets, not eight ─────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24" id="system">
        <div className="mb-10 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            The system
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Four moving parts. One calm dashboard.
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <BucketCard
            icon={<CalendarDays className="h-5 w-5" />}
            tag="01 · Scheduling"
            title="Bookings in, jobs out — automatically."
            bullets={[
              "iCal sync (Airbnb, VRBO, Booking) runs daily",
              "Tight-turnover warnings under 6 hours",
              "Recurring tasks for deep cleans and filter changes",
            ]}
          />
          <BucketCard
            icon={<Camera className="h-5 w-5" />}
            tag="02 · Execution"
            title="No unit is ready without proof."
            bullets={[
              "Required checklists per property template",
              "Before/after photos enforced server-side",
              "Issue flags require a photo on severity ≥ medium",
            ]}
          />
          <BucketCard
            icon={<Users className="h-5 w-5" />}
            tag="03 · Team"
            title="A team that can't ghost you."
            bullets={[
              "Accept, decline with a reason, or signal running late",
              "Per-job chat thread for every booking",
              "Auto-reassign when someone declines",
            ]}
          />
          <BucketCard
            icon={<Banknote className="h-5 w-5" />}
            tag="04 · Money"
            title="Payout reports, not spreadsheets."
            bullets={[
              "Per-cleaner reports by week, month, or custom range",
              "Line-by-line Mark paid + pending dashboard tile",
              "1099 flag + annual tax-ready PDF",
            ]}
          />
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Plus the under-the-hood wins you only notice after you&apos;ve shipped
          a few weeks:{" "}
          <span className="text-foreground">reliability scores</span>,{" "}
          <span className="text-foreground">supervisor review queue</span>,{" "}
          <span className="text-foreground">smart-lock-ready access codes</span>,{" "}
          <span className="text-foreground">weekly recap</span>,{" "}
          <span className="text-foreground">keyboard shortcuts</span>,{" "}
          <span className="text-foreground">ICS subscribe-out to your own calendar</span>.
        </p>
      </section>

      {/* ── Visual proof — realistic booking calendar + mobile job card ─── */}
      <section className="border-y border-border/60 bg-gradient-to-b from-card/60 to-card/20">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="mb-8 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              What it looks like
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Your whole portfolio on one screen.
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Property rows down, days across. Multi-night stays render as coloured chips
              in their platform&apos;s colour. Your cleaning jobs slot in between.
            </p>
          </div>
          <MockHotelCalendar />

          {/* Mobile job-card mock beside the calendar */}
          <div className="mt-12 grid items-center gap-10 md:grid-cols-[1fr_auto]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                On-site
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
                Cleaners get clarity. You get proof.
              </h3>
              <p className="mt-3 max-w-md text-base leading-7 text-muted-foreground">
                Every job shows the exact window, the property&apos;s door code,
                pinned cleaner notes, and a one-tap upload for arrival photos.
                When they submit, you get the proof — not a text.
              </p>
            </div>
            <MockCleanerJob />
          </div>
        </div>
      </section>

      {/* ── How it works — iconed steps ─────────────────────── */}
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
          <HowStep
            step="01"
            icon={<Link2 className="h-5 w-5" />}
            title="Connect your calendar"
            body="Paste the iCal URL from Airbnb, VRBO, or Booking. First sync runs the moment you hit save."
          />
          <HowStep
            step="02"
            icon={<Zap className="h-5 w-5" />}
            title="Jobs are created"
            body="Every guest checkout becomes a cleaning assignment in your property's local time — no manual entry."
          />
          <HowStep
            step="03"
            icon={<Camera className="h-5 w-5" />}
            title="Cleaners deliver proof"
            body="They accept, execute the checklist, upload photos, and submit. You approve — or flag a re-clean."
          />
        </ol>
      </section>

      {/* ── Why TurnFlow ────────────────────────────────────── */}
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
              title="No bloated software for 200 properties"
              body="No two-week onboarding. No 47-tab settings. Built for 1–20 properties, with real care."
            />
            <PositionCard
              title="Built by an operator"
              body="Designed from the ground up by someone running Airbnb properties right now — not a SaaS team guessing at workflow."
            />
          </div>
        </div>
      </section>

      {/* ── Founder — bulleted ──────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 py-16 md:py-20" id="founder">
        <div className="rounded-[1.75rem] border border-border/70 bg-card p-8 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Built from the ground up
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Built by someone who actually runs Airbnb properties.
          </h2>
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            I built TurnFlow after:
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {[
              "A cleaner ghosted a Sunday checkout and I found out when the guest arrived.",
              "A re-clean went sideways and I had zero photo proof to point to.",
              "Tax season hit and I reconstructed a 1099 from eight months of text threads.",
            ].map((line) => (
              <li
                className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/60 px-4 py-3 text-sm leading-6"
                key={line}
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-base leading-7">
            <span className="font-semibold text-foreground">
              If it&apos;s in TurnFlow, it&apos;s because I needed it.
            </span>{" "}
            I&apos;m onboarding operators one at a time so it fits your workflow,
            not the other way around.
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
              Only onboarding a small number of operators this month. Drop your
              email + portfolio size and we&apos;ll personally walk you through
              setup — no credit card, no spam.
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
            <span>· The operating system for Airbnb turnovers</span>
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

function BucketCard({
  icon,
  tag,
  title,
  bullets,
}: {
  icon: React.ReactNode;
  tag: string;
  title: string;
  bullets: string[];
}) {
  return (
    <article className="flex flex-col gap-4 rounded-[1.5rem] border border-border/70 bg-card p-7 transition hover:border-primary/30 hover:shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {tag}
        </span>
      </div>
      <h3 className="text-xl font-semibold leading-snug tracking-tight">{title}</h3>
      <ul className="flex flex-col gap-2 text-sm leading-6">
        {bullets.map((b) => (
          <li className="flex items-start gap-2 text-muted-foreground" key={b}>
            <CheckCircle2
              className="mt-1 h-3.5 w-3.5 shrink-0 text-primary/70"
              aria-hidden="true"
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function HowStep({
  step,
  icon,
  title,
  body,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-[1.5rem] border border-border/70 bg-card p-6">
      <div className="flex items-center justify-between">
        <span className="text-5xl font-semibold leading-none text-primary/20">
          {step}
        </span>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
    </li>
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

// Hotel-style booking calendar — property rows × many days, multi-day platform
// chips spanning multiple cells, blocked dates with a lock pattern. Rendered
// entirely in DOM so it stays crisp at any size.
function MockHotelCalendar() {
  const days = Array.from({ length: 14 }, (_, i) => i + 10); // Nov 10-23

  type Block =
    | { kind: "airbnb"; label: string; start: number; end: number }
    | { kind: "booking"; label: string; start: number; end: number }
    | { kind: "expedia"; label: string; start: number; end: number }
    | { kind: "blocked"; start: number; end: number }
    | { kind: "clean"; label: string; start: number; end: number };

  const rows: Array<{ property: string; size: string; blocks: Block[] }> = [
    {
      property: "Lakeview Loft",
      size: "2 BR · ET",
      blocks: [
        { kind: "booking", label: "#412 Booking.com", start: 11, end: 14 },
        { kind: "clean", label: "Alice", start: 14, end: 14 },
        { kind: "airbnb", label: "#98 Airbnb", start: 15, end: 20 },
      ],
    },
    {
      property: "2 BR Providence",
      size: "2 BR · ET",
      blocks: [
        { kind: "airbnb", label: "#73 Airbnb", start: 10, end: 13 },
        { kind: "clean", label: "Maria", start: 13, end: 13 },
        { kind: "expedia", label: "#51 Expedia", start: 14, end: 19 },
      ],
    },
    {
      property: "Downtown Studio",
      size: "Studio · ET",
      blocks: [
        { kind: "blocked", start: 10, end: 15 },
        { kind: "booking", label: "#334 Booking.com", start: 17, end: 22 },
      ],
    },
    {
      property: "Seaside Cottage",
      size: "3 BR · ET",
      blocks: [
        { kind: "airbnb", label: "#201 Airbnb", start: 10, end: 12 },
        { kind: "clean", label: "Tight", start: 12, end: 12 },
        { kind: "airbnb", label: "#214 Airbnb", start: 12, end: 16 },
        { kind: "clean", label: "Ben", start: 16, end: 16 },
        { kind: "booking", label: "#447 Booking.com", start: 17, end: 23 },
      ],
    },
  ];

  const today = 15;

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card shadow-md">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold">Schedule · Nov 2026</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Live view
          </span>
        </div>
        <div className="hidden items-center gap-3 text-[10px] text-muted-foreground sm:flex">
          <Legend color="bg-red-400" label="Airbnb" />
          <Legend color="bg-blue-600" label="Booking" />
          <Legend color="bg-amber-400" label="Expedia" />
          <Legend color="bg-green-400" label="Clean" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-xs"
          style={{ minWidth: `${200 + days.length * 58}px` }}
        >
          <thead>
            <tr className="border-b border-border/60">
              <th className="sticky left-0 z-10 w-48 bg-card px-5 py-3 text-left font-medium uppercase tracking-wider text-muted-foreground">
                Property
              </th>
              {days.map((d) => (
                <th
                  className={`min-w-[58px] px-1 py-2 text-center text-[10px] font-medium uppercase tracking-wider ${
                    d === today ? "bg-primary/5 text-primary" : "text-muted-foreground"
                  }`}
                  key={d}
                >
                  <div>{weekdayAbbr(d)}</div>
                  <div
                    className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                      d === today ? "bg-primary text-[#f7f5ef]" : "text-foreground"
                    }`}
                  >
                    {d}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((row) => (
              <tr key={row.property}>
                <td className="sticky left-0 z-10 border-r border-border/60 bg-card px-5 py-3 align-top">
                  <p className="font-semibold leading-tight">{row.property}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{row.size}</p>
                </td>
                {days.map((d, cellIdx) => {
                  // Find a block that STARTS here — render it with the colspan.
                  const starting = row.blocks.find((b) => b.start === d);
                  if (starting) {
                    const span = Math.min(starting.end - starting.start + 1, days.length - cellIdx);
                    return (
                      <td
                        className="relative px-1 py-2 align-middle"
                        colSpan={span}
                        key={d}
                      >
                        <BookingChip block={starting} />
                      </td>
                    );
                  }
                  // If a block covers this day but started earlier, it's already rendered via colspan.
                  const covered = row.blocks.some((b) => b.start < d && b.end >= d);
                  if (covered) return null;
                  return (
                    <td
                      className={`px-1 py-2 ${d === today ? "bg-primary/[0.03]" : ""}`}
                      key={d}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function weekdayAbbr(day: number): string {
  // Simple demo mapping for the 10-23 range; not a real calendar calc.
  const names = ["T", "W", "T", "F", "S", "S", "M", "T", "W", "T", "F", "S", "S", "M"];
  return names[day - 10] ?? "";
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function BookingChip({
  block,
}: {
  block:
    | { kind: "airbnb"; label: string }
    | { kind: "booking"; label: string }
    | { kind: "expedia"; label: string }
    | { kind: "blocked" }
    | { kind: "clean"; label: string };
}) {
  if (block.kind === "blocked") {
    return (
      <div
        className="flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 bg-muted text-[10px] font-medium text-muted-foreground"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, transparent 0 5px, rgba(0,0,0,0.05) 5px 10px)",
        }}
      >
        <Lock className="h-3 w-3" aria-hidden="true" />
        Blocked
      </div>
    );
  }
  if (block.kind === "clean") {
    const tight = block.label === "Tight";
    return (
      <div
        className={`flex h-7 w-full items-center justify-center gap-1 rounded-lg border px-2 text-[10px] font-semibold ${
          tight
            ? "border-red-300 bg-red-50 text-red-800"
            : "border-green-300 bg-green-50 text-green-800"
        }`}
      >
        {tight ? (
          <Clock className="h-3 w-3" aria-hidden="true" />
        ) : (
          <MessageCircle className="h-3 w-3" aria-hidden="true" />
        )}
        <span className="truncate">{tight ? "Tight turn" : `Clean · ${block.label}`}</span>
      </div>
    );
  }

  const styles = {
    airbnb: "bg-gradient-to-r from-rose-500 to-rose-400 text-white",
    booking: "bg-gradient-to-r from-blue-700 to-blue-600 text-white",
    expedia: "bg-gradient-to-r from-amber-500 to-amber-400 text-white",
  } as const;

  return (
    <div
      className={`flex h-7 w-full items-center gap-1.5 rounded-full px-3 text-[10px] font-semibold shadow-sm ${styles[block.kind]}`}
    >
      <span className="flex h-1.5 w-1.5 rounded-full bg-white/70" aria-hidden="true" />
      <span className="truncate">{block.label}</span>
    </div>
  );
}

// Mobile-sized cleaner job card — mirrors what the cleaner actually sees on-site
function MockCleanerJob() {
  return (
    <div className="mx-auto w-full max-w-[320px] rounded-[2rem] border-[8px] border-foreground/80 bg-card p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          9:41
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          TurnFlow
        </p>
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-border/70 bg-background p-3">
        <p className="text-xs text-muted-foreground">← Jobs</p>
        <h4 className="mt-1 text-base font-semibold">Lakeview Loft</h4>
        <div className="mt-2 space-y-0.5 rounded-xl bg-muted/60 p-2 text-[11px] leading-5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cleaning window
          </p>
          <p>
            <span className="text-muted-foreground">Start after</span>{" "}
            <span className="font-semibold">Tue, 11:00 AM</span>
          </p>
          <p>
            <span className="text-muted-foreground">Done by</span>{" "}
            <span className="font-semibold">Wed, 3:00 PM</span>
          </p>
        </div>
      </div>

      {/* Access code */}
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
          <KeyRound className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-primary/80">
            Property code
          </p>
          <p className="font-mono text-lg font-semibold tracking-wider">4287</p>
        </div>
        <span className="rounded-full border border-primary/30 bg-white px-2 py-1 text-[10px] font-semibold text-primary">
          Copy
        </span>
      </div>

      {/* Cleaner notes */}
      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-800">
          Read first
        </p>
        <p className="mt-1 text-amber-900">
          WiFi: Lakeview-Guest / 55Lake! · Linens top shelf hallway closet · Trash bins in garage
        </p>
      </div>

      {/* Quick actions */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center justify-center gap-1 rounded-xl border border-border/70 bg-card px-2 py-2 text-[10px] font-medium">
          <Zap className="h-3 w-3" /> Running late
        </div>
        <div className="flex items-center justify-center gap-1 rounded-xl border border-border/70 bg-card px-2 py-2 text-[10px] font-medium">
          <Camera className="h-3 w-3" /> Upload photo
        </div>
      </div>

      {/* Primary CTA */}
      <div className="mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-primary text-xs font-semibold text-[#f7f5ef]">
        Start job
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <ClipboardCheck className="h-3 w-3" /> 4 / 12 checklist
        </span>
        <span className="flex items-center gap-1">
          <Camera className="h-3 w-3" /> 2 / 5 photos
        </span>
      </div>
    </div>
  );
}
