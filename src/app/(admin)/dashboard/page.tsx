import type { Route } from "next";
import {
  AlertCircle,
  CalendarDays,
  UserMinus,
  AlertTriangle,
  RefreshCw,
  PackageSearch,
} from "lucide-react";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { getDashboardCounts, listTodaysAssignmentsForAdmin } from "@/lib/queries/assignments";
import { getExceptionCounts } from "@/lib/queries/issues";
import { SignOutButton } from "@/components/auth/sign-out-button";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    unassigned: "bg-yellow-50 text-yellow-700 border-yellow-200",
    assigned: "bg-blue-50 text-blue-700 border-blue-200",
    confirmed: "bg-indigo-50 text-indigo-700 border-indigo-200",
    in_progress: "bg-orange-50 text-orange-700 border-orange-200",
    completed_pending_review: "bg-purple-50 text-purple-700 border-purple-200",
    approved: "bg-green-50 text-green-700 border-green-200",
    needs_reclean: "bg-red-50 text-red-700 border-red-200",
  };
  return map[status] ?? "bg-gray-50 text-gray-600 border-gray-200";
}

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function DashboardPage() {
  const profile = await requireRole(["owner", "admin", "supervisor"]);

  const [counts, todaysJobs, exceptions] = await Promise.all([
    getDashboardCounts(),
    listTodaysAssignmentsForAdmin(),
    getExceptionCounts(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Overview
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">
            Welcome back, {profile.full_name.split(" ")[0]}
          </h1>
        </div>
        {/* Sign-out visible on mobile only; desktop uses sidebar */}
        <div className="flex items-center gap-3 lg:hidden">
          <span className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground capitalize">
            {profile.role}
          </span>
          <SignOutButton />
        </div>
      </div>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Key metrics">
        <Link
          href={"/dashboard/assignments" as Route}
          className="group rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition duration-200 hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Today&apos;s jobs</p>
            <CalendarDays className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-primary/60" aria-hidden="true" />
          </div>
          <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">
            {counts.todaysJobs}
          </p>
          <p className="mt-2 text-xs font-medium text-primary/70">View assignments →</p>
        </Link>

        <Link
          href={"/dashboard/assignments" as Route}
          className="group rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition duration-200 hover:border-destructive/30 hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Overdue / at-risk</p>
            <AlertCircle
              className={`h-4 w-4 transition-colors ${counts.atRisk > 0 ? "text-destructive/70" : "text-muted-foreground/60"}`}
              aria-hidden="true"
            />
          </div>
          <p
            className={`mt-3 text-4xl font-semibold tabular-nums tracking-tight ${counts.atRisk > 0 ? "text-destructive" : ""}`}
          >
            {counts.atRisk}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Jobs past due date</p>
        </Link>

        <Link
          href={"/dashboard/assignments/new" as Route}
          className="group rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition duration-200 hover:border-yellow-300 hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Unassigned</p>
            <UserMinus
              className={`h-4 w-4 transition-colors ${counts.unassigned > 0 ? "text-yellow-600/70" : "text-muted-foreground/60"}`}
              aria-hidden="true"
            />
          </div>
          <p
            className={`mt-3 text-4xl font-semibold tabular-nums tracking-tight ${counts.unassigned > 0 ? "text-yellow-600" : ""}`}
          >
            {counts.unassigned}
          </p>
          <p className="mt-2 text-xs font-medium text-yellow-600/80">Assign a cleaner →</p>
        </Link>
      </section>

      {/* Today's job feed */}
      {todaysJobs.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Today's schedule">
          <h2 className="text-base font-semibold">Today&apos;s schedule</h2>
          <div className="flex flex-col gap-2">
            {todaysJobs.map((a) => (
              <article
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4"
              >
                <div>
                  <p className="text-sm font-semibold">{a.properties?.name ?? "Property"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatTime(a.due_at)}
                    {a.cleaners ? ` · ${a.cleaners.full_name}` : " · Unassigned"}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(a.status)}`}
                >
                  {formatStatus(a.status)}
                </span>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Exceptions */}
      {(exceptions.open_issues > 0 || exceptions.pending_recleans > 0 || exceptions.low_inventory_items > 0) && (
        <section className="grid gap-4 sm:grid-cols-3" aria-label="Exceptions requiring attention">
          <h2 className="text-base font-semibold sm:col-span-3">Needs attention</h2>

          <Link
            href={"/dashboard/issues" as Route}
            className={`group rounded-2xl border p-5 shadow-sm transition duration-200 hover:shadow-md ${
              exceptions.critical_issues > 0
                ? "border-red-200 bg-red-50 hover:border-red-300"
                : "border-amber-200 bg-amber-50 hover:border-amber-300"
            }`}
          >
            <div className="flex items-start justify-between">
              <p className="text-sm text-muted-foreground">Open issues</p>
              <AlertTriangle
                className={`h-4 w-4 ${exceptions.critical_issues > 0 ? "text-red-500" : "text-amber-500"}`}
                aria-hidden="true"
              />
            </div>
            <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight text-amber-700">
              {exceptions.open_issues}
            </p>
            {exceptions.critical_issues > 0 && (
              <p className="mt-1 text-xs font-semibold text-red-600">
                {exceptions.critical_issues} critical
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">View issues →</p>
          </Link>

          <Link
            href={"/dashboard/review" as Route}
            className="group rounded-2xl border border-purple-200 bg-purple-50 p-5 shadow-sm transition duration-200 hover:border-purple-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <p className="text-sm text-muted-foreground">Pending re-cleans</p>
              <RefreshCw className="h-4 w-4 text-purple-400" aria-hidden="true" />
            </div>
            <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight text-purple-700">
              {exceptions.pending_recleans}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Unassigned re-cleans</p>
          </Link>

          <Link
            href={"/dashboard/issues" as Route}
            className="group rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition duration-200 hover:border-amber-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <p className="text-sm text-muted-foreground">Low inventory</p>
              <PackageSearch className="h-4 w-4 text-amber-500" aria-hidden="true" />
            </div>
            <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight text-amber-700">
              {exceptions.low_inventory_items}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Items below threshold →</p>
          </Link>
        </section>
      )}
    </main>
  );
}
