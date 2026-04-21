import type { Route } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckSquare2, Clock, Sparkles } from "lucide-react";

import type { AssignmentListRecord, AssignmentScheduleRecord } from "@/lib/queries/assignments";
import { isTightTurnover } from "@/lib/domain/assignments";

type Props = {
  todaysJobs: AssignmentListRecord[];
  atRiskJobs: AssignmentListRecord[];
  weekAssignments: AssignmentScheduleRecord[];
  pendingReviewCount: number;
  unassignedCount: number;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }) + (sameDay ? "" : ` · ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
}

function formatRelative(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const mins = Math.round(diffMs / 60_000);
  if (mins < -60) return `${Math.abs(Math.round(mins / 60))}h overdue`;
  if (mins < 0) return `${Math.abs(mins)}m overdue`;
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.round(hrs / 24)}d`;
}

/**
 * Answers the single question: "What's the most important thing right now?"
 * Priority ladder:
 * 1. Any overdue / at-risk job (red)
 * 2. Tight-turnover happening today (red)
 * 3. In-progress cleanings (orange)
 * 4. Pending reviews (purple)
 * 5. Next upcoming checkout or cleaning (neutral)
 * 6. Empty calm state
 */
export function RightNowHero({
  todaysJobs,
  atRiskJobs,
  weekAssignments,
  pendingReviewCount,
  unassignedCount,
}: Props) {
  // 1. Overdue / at-risk
  if (atRiskJobs.length > 0) {
    const first = atRiskJobs[0];
    const tail =
      atRiskJobs.length > 1
        ? `and ${atRiskJobs.length - 1} more`
        : formatRelative(first.due_at);
    return (
      <HeroCard
        cta="Assign now"
        href={"/dashboard/assignments" as Route}
        icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
        message={`Overdue: ${first.properties?.name ?? "Property"}, ${tail}`}
        subtitle={
          first.cleaners?.full_name
            ? `${first.cleaners.full_name} was assigned — follow up.`
            : "No cleaner assigned yet."
        }
        tone="red"
      />
    );
  }

  // 2. Tight turnover today
  const tightToday = todaysJobs.find((a) =>
    isTightTurnover(a.checkout_at, a.next_checkin_at),
  );
  if (tightToday) {
    return (
      <HeroCard
        cta="Review"
        href={"/dashboard/schedule" as Route}
        icon={<Clock className="h-5 w-5" aria-hidden="true" />}
        message={`Tight turn today: ${tightToday.properties?.name ?? "Property"} at ${formatWhen(tightToday.due_at)}`}
        subtitle={
          tightToday.cleaners?.full_name
            ? `${tightToday.cleaners.full_name} needs to be on-site by checkout.`
            : "Still unassigned. Assign a cleaner now."
        }
        tone="red"
      />
    );
  }

  // 3. In-progress
  const inProgress = todaysJobs.find((a) => a.status === "in_progress");
  if (inProgress) {
    return (
      <HeroCard
        cta="Open job"
        href={`/jobs/${inProgress.id}` as Route}
        icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
        message={`In progress: ${inProgress.cleaners?.full_name?.split(" ")[0] ?? "Cleaner"} at ${inProgress.properties?.name ?? "Property"}`}
        subtitle={
          inProgress.due_at
            ? `Due by ${formatWhen(inProgress.due_at)}.`
            : "Cleaning underway."
        }
        tone="orange"
      />
    );
  }

  // 4. Pending review
  if (pendingReviewCount > 0) {
    return (
      <HeroCard
        cta="Review queue"
        href={"/dashboard/review" as Route}
        icon={<CheckSquare2 className="h-5 w-5" aria-hidden="true" />}
        message={`${pendingReviewCount} job${pendingReviewCount === 1 ? "" : "s"} awaiting your approval`}
        subtitle="Photos & checklist proof are ready. Approve or flag a re-clean."
        tone="purple"
      />
    );
  }

  // 5. Next upcoming
  const nowMs = Date.now();
  const nextUp = [...weekAssignments]
    .filter(
      (a) =>
        !["approved", "cancelled"].includes(a.status) &&
        new Date(a.due_at).getTime() >= nowMs,
    )
    .sort((a, b) => a.due_at.localeCompare(b.due_at))[0];

  if (nextUp) {
    return (
      <HeroCard
        cta="See schedule"
        href={"/dashboard/schedule" as Route}
        icon={<Clock className="h-5 w-5" aria-hidden="true" />}
        message={`Next up: ${nextUp.properties?.name ?? "Property"} ${formatRelative(nextUp.due_at)}`}
        subtitle={
          nextUp.cleaners?.full_name
            ? `${nextUp.cleaners.full_name} is on deck for ${formatWhen(nextUp.due_at)}.`
            : unassignedCount > 0
              ? `Unassigned — pick a cleaner before the turnover.`
              : `Scheduled for ${formatWhen(nextUp.due_at)}.`
        }
        tone="neutral"
      />
    );
  }

  // 6. Calm state
  return (
    <HeroCard
      icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
      message="All clear — nothing urgent."
      subtitle="No upcoming turnovers this week. Breathe, refresh a listing, or plan a deep clean."
      tone="neutral"
    />
  );
}

// ─── Hero card presentation ──────────────────────────────────────────────────

type HeroCardProps = {
  icon: React.ReactNode;
  message: string;
  subtitle: string;
  tone: "red" | "orange" | "purple" | "neutral";
  cta?: string;
  href?: Route;
};

function HeroCard({ icon, message, subtitle, tone, cta, href }: HeroCardProps) {
  const toneClass: Record<string, string> = {
    red: "border-red-200 bg-red-50/60 text-red-900",
    orange: "border-orange-200 bg-orange-50/60 text-orange-900",
    purple: "border-purple-200 bg-purple-50/60 text-purple-900",
    neutral: "border-border/70 bg-card text-foreground",
  };
  const ctaTone: Record<string, string> = {
    red: "bg-red-600 text-white hover:bg-red-700",
    orange: "bg-orange-600 text-white hover:bg-orange-700",
    purple: "bg-purple-600 text-white hover:bg-purple-700",
    neutral: "bg-primary text-[#f7f5ef] hover:opacity-90",
  };

  return (
    <section
      className={`flex flex-col gap-3 rounded-[1.75rem] border px-6 py-6 sm:flex-row sm:items-center sm:gap-6 sm:px-8 sm:py-7 ${toneClass[tone]}`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
            Right now
          </p>
          <p className="mt-0.5 text-lg font-semibold leading-snug sm:text-xl">
            {message}
          </p>
          <p className="mt-1 text-sm opacity-80">{subtitle}</p>
        </div>
      </div>
      {cta && href && (
        <Link
          className={`inline-flex h-10 shrink-0 items-center gap-1.5 self-start rounded-full px-5 text-xs font-semibold transition sm:ml-auto sm:self-center ${ctaTone[tone]}`}
          href={href}
        >
          {cta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
