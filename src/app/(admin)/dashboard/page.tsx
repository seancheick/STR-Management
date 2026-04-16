import type { Route } from "next";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckSquare2,
  Clock,
  PackageSearch,
  RefreshCw,
  UserMinus,
  Zap,
} from "lucide-react";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import {
  getDashboardStats,
  listTodaysAssignmentsForAdmin,
  listAtRiskAssignments,
  listAssignmentsForSchedule,
  getPropertyTodayStatuses,
  type PropertyTodayStatus,
} from "@/lib/queries/assignments";
import { getExceptionCounts } from "@/lib/queries/issues";
import { TodayJobsTimeline, AtRiskSection } from "@/components/dashboard/today-jobs-timeline";
import { WeekPreviewStrip } from "@/components/dashboard/week-preview-strip";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}


const PROPERTY_STATUS_CONFIG: Record<
  PropertyTodayStatus["status"],
  { label: string; dot: string; badge: string }
> = {
  unassigned:     { label: "Needs cleaner",  dot: "bg-amber-400",  badge: "bg-amber-50 text-amber-700 border-amber-200" },
  assigned:       { label: "Assigned",       dot: "bg-blue-400",   badge: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress:    { label: "In progress",    dot: "bg-orange-400", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  pending_review: { label: "Pending review", dot: "bg-purple-400", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  ready:          { label: "Ready",          dot: "bg-green-400",  badge: "bg-green-50 text-green-700 border-green-200" },
  quiet:          { label: "No jobs today",  dot: "bg-border",     badge: "bg-muted/60 text-muted-foreground border-border/60" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const profile = await requireRole(["owner", "admin", "supervisor"]);

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
  weekEnd.setUTCHours(23, 59, 59, 999);

  // 7 day ISO strings (midnight UTC) for the strip
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + i);
    return d.toISOString();
  });

  const [stats, todaysJobs, exceptions, propertyStatuses, atRiskJobs, weekAssignments] =
    await Promise.all([
      getDashboardStats(),
      listTodaysAssignmentsForAdmin(),
      getExceptionCounts(),
      getPropertyTodayStatuses(),
      listAtRiskAssignments(),
      listAssignmentsForSchedule(weekStart.toISOString(), weekEnd.toISOString()),
    ]);

  const firstName = profile.full_name.split(" ")[0];
  const hasExceptions =
    exceptions.open_issues > 0 ||
    exceptions.pending_recleans > 0 ||
    stats.atRisk > 0;

  // Group property statuses by urgency for ordering
  const urgencyOrder: Record<PropertyTodayStatus["status"], number> = {
    unassigned: 0, in_progress: 1, assigned: 2, pending_review: 3, ready: 4, quiet: 5,
  };
  const sortedProperties = [...propertyStatuses].sort(
    (a, b) => urgencyOrder[a.status] - urgencyOrder[b.status],
  );

  return (
    <div className="flex min-h-screen flex-col">

      {/* ── Top header ─────────────────────────────────────────────── */}
      <div className="border-b border-border/60 bg-card px-6 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Overview</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Welcome back, {firstName}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-sm text-muted-foreground sm:block">{formatDate(today)}</p>
            <Link
              href={"/dashboard/schedule" as Route}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Schedule
            </Link>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            {
              label: "Checkouts today",
              value: stats.checkoutsToday,
              href: "/dashboard/schedule",
              color: stats.checkoutsToday > 0 ? "text-primary" : "",
              urgent: false,
            },
            {
              label: "Cleanings due",
              value: stats.cleaningsDueToday,
              href: "/dashboard/schedule",
              color: "",
              urgent: false,
            },
            {
              label: "Unassigned",
              value: stats.unassigned,
              href: "/dashboard/assignments",
              color: stats.unassigned > 0 ? "text-amber-600" : "",
              urgent: stats.unassigned > 0,
            },
            {
              label: "In progress",
              value: stats.inProgress,
              href: "/dashboard/assignments",
              color: stats.inProgress > 0 ? "text-orange-600" : "",
              urgent: false,
            },
            {
              label: "Pending review",
              value: stats.pendingReview,
              href: "/dashboard/review",
              color: stats.pendingReview > 0 ? "text-purple-600" : "",
              urgent: false,
            },
            {
              label: "At risk",
              value: stats.atRisk,
              href: "/dashboard/assignments",
              color: stats.atRisk > 0 ? "text-destructive" : "",
              urgent: stats.atRisk > 0,
            },
          ].map(({ label, value, href, color, urgent }) => (
            <Link
              key={label}
              href={href as Route}
              className={`flex flex-col rounded-xl border px-4 py-3 transition hover:shadow-sm ${
                urgent
                  ? "border-amber-200 bg-amber-50 hover:border-amber-300"
                  : "border-border/70 bg-background/60 hover:border-primary/30"
              }`}
            >
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${color}`}>
                {value}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Exception banner ───────────────────────────────────────── */}
      {hasExceptions && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
              <span className="text-xs font-semibold text-amber-800">Needs attention</span>
            </div>
            {stats.atRisk > 0 && (
              <Link href={"/dashboard/assignments" as Route} className="flex items-center gap-1 text-xs text-amber-700 hover:underline underline-offset-2">
                <AlertCircle className="h-3.5 w-3.5" />
                {stats.atRisk} overdue job{stats.atRisk !== 1 ? "s" : ""}
              </Link>
            )}
            {stats.unassigned > 0 && (
              <Link href={"/dashboard/assignments" as Route} className="flex items-center gap-1 text-xs text-amber-700 hover:underline underline-offset-2">
                <UserMinus className="h-3.5 w-3.5" />
                {stats.unassigned} unassigned
              </Link>
            )}
            {exceptions.open_issues > 0 && (
              <Link href={"/dashboard/issues" as Route} className="flex items-center gap-1 text-xs text-amber-700 hover:underline underline-offset-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                {exceptions.open_issues} open issue{exceptions.open_issues !== 1 ? "s" : ""}
                {exceptions.critical_issues > 0 && (
                  <span className="ml-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                    {exceptions.critical_issues} critical
                  </span>
                )}
              </Link>
            )}
            {exceptions.pending_recleans > 0 && (
              <Link href={"/dashboard/review" as Route} className="flex items-center gap-1 text-xs text-amber-700 hover:underline underline-offset-2">
                <RefreshCw className="h-3.5 w-3.5" />
                {exceptions.pending_recleans} re-clean{exceptions.pending_recleans !== 1 ? "s" : ""} pending
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Body: property rail + main content ────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Property status rail */}
        <aside className="hidden w-64 shrink-0 border-r border-border/60 bg-card/50 lg:flex lg:flex-col">
          <div className="border-b border-border/60 px-4 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Properties
            </p>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Property status">
            {sortedProperties.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">No properties yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {sortedProperties.map((p) => {
                  const cfg = PROPERTY_STATUS_CONFIG[p.status];
                  return (
                    <li key={p.propertyId}>
                      <Link
                        href={`/dashboard/properties/${p.propertyId}` as Route}
                        className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition hover:bg-muted"
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cfg.dot}`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium leading-snug">{p.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {cfg.label}
                            {p.cleanerName ? ` · ${p.cleanerName}` : ""}
                          </p>
                          {p.dueAt && (
                            <p className="text-[11px] text-muted-foreground/70">
                              Due {new Date(p.dueAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
          <div className="border-t border-border/60 px-4 py-3">
            <Link
              href={"/dashboard/properties" as Route}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-2"
            >
              Manage properties <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-8">

            {/* Today's jobs — interactive, drawer on click */}
            <section aria-label="Today's jobs">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Today&apos;s jobs</h2>
                <Link
                  href={"/dashboard/schedule" as Route}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-2"
                >
                  Full schedule <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <TodayJobsTimeline jobs={todaysJobs} />
            </section>

            {/* At-risk / overdue — interactive, drawer on click */}
            <AtRiskSection jobs={atRiskJobs} />

            {/* Pending review */}
            {stats.pendingReview > 0 && (
              <section aria-label="Pending review">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-base font-semibold">
                    <CheckSquare2 className="h-4 w-4 text-purple-500" aria-hidden="true" />
                    Ready for review
                  </h2>
                  <Link
                    href={"/dashboard/review" as Route}
                    className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:underline underline-offset-2"
                  >
                    Open review queue <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="rounded-2xl border border-purple-200 bg-purple-50 px-5 py-4">
                  <p className="text-sm font-medium text-purple-800">
                    {stats.pendingReview} job{stats.pendingReview !== 1 ? "s" : ""} waiting for your approval
                  </p>
                  <p className="mt-1 text-xs text-purple-600/80">
                    Review photos and checklist proof before marking properties guest-ready.
                  </p>
                  <Link
                    href={"/dashboard/review" as Route}
                    className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-purple-600 px-4 text-xs font-medium text-white transition hover:bg-purple-700"
                  >
                    Review now <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </section>
            )}

            {/* Issues */}
            {exceptions.open_issues > 0 && (
              <section aria-label="Open issues">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-base font-semibold">
                    <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    Open issues
                  </h2>
                  <Link
                    href={"/dashboard/issues" as Route}
                    className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline underline-offset-2"
                  >
                    View all issues <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div
                    className={`rounded-2xl border p-5 shadow-sm ${
                      exceptions.critical_issues > 0
                        ? "border-red-200 bg-red-50"
                        : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <p className="text-sm text-muted-foreground">Open issues</p>
                      <AlertTriangle
                        className={`h-4 w-4 ${exceptions.critical_issues > 0 ? "text-red-500" : "text-amber-500"}`}
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-2 text-3xl font-semibold tabular-nums text-amber-700">
                      {exceptions.open_issues}
                    </p>
                    {exceptions.critical_issues > 0 && (
                      <p className="mt-1 text-xs font-semibold text-red-600">
                        {exceptions.critical_issues} critical
                      </p>
                    )}
                  </div>
                  {exceptions.low_inventory_items > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                      <div className="flex items-start justify-between">
                        <p className="text-sm text-muted-foreground">Low inventory</p>
                        <PackageSearch className="h-4 w-4 text-amber-500" aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-3xl font-semibold tabular-nums text-amber-700">
                        {exceptions.low_inventory_items}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Items below threshold</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Week preview strip */}
            <WeekPreviewStrip assignments={weekAssignments} days={weekDays} />

            {/* Quick links to other sections */}
            <section aria-label="Quick actions" className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  href: "/dashboard/schedule",
                  icon: CalendarDays,
                  label: "Week schedule",
                  sub: "Full calendar view",
                },
                {
                  href: "/dashboard/analytics",
                  icon: Clock,
                  label: "Analytics",
                  sub: "Cleaner & property scores",
                },
                {
                  href: "/dashboard/payouts",
                  icon: RefreshCw,
                  label: "Payouts",
                  sub: "Generate & export batches",
                },
              ].map(({ href, icon: Icon, label, sub }) => (
                <Link
                  key={href}
                  href={href as Route}
                  className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4 transition hover:border-primary/30 hover:shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{sub}</p>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
                </Link>
              ))}
            </section>

          </div>
        </main>
      </div>
    </div>
  );
}
