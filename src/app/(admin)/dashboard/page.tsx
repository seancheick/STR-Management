import type { Route } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { getDashboardCounts, listTodaysAssignmentsForAdmin } from "@/lib/queries/assignments";
import { getExceptionCounts } from "@/lib/queries/issues";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    unassigned: "bg-yellow-50 text-yellow-700",
    assigned: "bg-blue-50 text-blue-700",
    confirmed: "bg-indigo-50 text-indigo-700",
    in_progress: "bg-orange-50 text-orange-700",
    completed_pending_review: "bg-purple-50 text-purple-700",
  };
  return map[status] ?? "bg-gray-50 text-gray-600";
}

export default async function DashboardPage() {
  const profile = await requireRole(["owner", "admin", "supervisor"]);

  const [counts, todaysJobs, exceptions] = await Promise.all([
    getDashboardCounts(),
    listTodaysAssignmentsForAdmin(),
    getExceptionCounts(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Admin Dashboard
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Welcome back, {profile.full_name}
          </h1>
        </div>
        <div className="rounded-full border border-border/70 bg-card px-4 py-2 text-sm text-muted-foreground">
          {profile.role}
        </div>
      </div>

      {/* KPI cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <Link
          href={"/dashboard/assignments" as Route}
          className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm transition hover:border-primary/30"
        >
          <p className="text-sm text-muted-foreground">Today&apos;s jobs</p>
          <p className="mt-4 text-4xl font-semibold tracking-tight">{counts.todaysJobs}</p>
          <p className="mt-2 text-sm text-muted-foreground">View all →</p>
        </Link>

        <Link
          href={"/dashboard/assignments" as Route}
          className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm transition hover:border-destructive/30"
        >
          <p className="text-sm text-muted-foreground">Overdue / at-risk</p>
          <p
            className={`mt-4 text-4xl font-semibold tracking-tight ${counts.atRisk > 0 ? "text-destructive" : ""}`}
          >
            {counts.atRisk}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Jobs past due date</p>
        </Link>

        <Link
          href={"/dashboard/assignments/new" as Route}
          className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm transition hover:border-yellow-300"
        >
          <p className="text-sm text-muted-foreground">Unassigned</p>
          <p
            className={`mt-4 text-4xl font-semibold tracking-tight ${counts.unassigned > 0 ? "text-yellow-600" : ""}`}
          >
            {counts.unassigned}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Need a cleaner →</p>
        </Link>
      </section>

      {/* Today's job feed */}
      {todaysJobs.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Today</h2>
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
                className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(a.status)}`}
              >
                {a.status.replace(/_/g, " ")}
              </span>
            </article>
          ))}
        </section>
      )}

      {/* Exceptions row */}
      {(exceptions.open_issues > 0 || exceptions.pending_recleans > 0 || exceptions.low_inventory_items > 0) && (
        <section className="grid gap-4 md:grid-cols-3">
          <Link
            href={"/dashboard/issues" as Route}
            className={`rounded-[1.5rem] border p-5 shadow-sm transition hover:border-destructive/40 ${
              exceptions.critical_issues > 0
                ? "border-red-200 bg-red-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <p className="text-sm text-muted-foreground">Open issues</p>
            <p className={`mt-4 text-4xl font-semibold tracking-tight ${exceptions.open_issues > 0 ? "text-amber-700" : ""}`}>
              {exceptions.open_issues}
            </p>
            {exceptions.critical_issues > 0 && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {exceptions.critical_issues} critical
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">View issues →</p>
          </Link>

          <Link
            href={"/dashboard/issues" as Route}
            className="rounded-[1.5rem] border border-purple-200 bg-purple-50 p-5 shadow-sm transition hover:border-purple-400"
          >
            <p className="text-sm text-muted-foreground">Pending re-cleans</p>
            <p className={`mt-4 text-4xl font-semibold tracking-tight ${exceptions.pending_recleans > 0 ? "text-purple-700" : ""}`}>
              {exceptions.pending_recleans}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Unassigned re-cleans</p>
          </Link>

          <Link
            href={"/dashboard/issues" as Route}
            className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:border-amber-400"
          >
            <p className="text-sm text-muted-foreground">Low inventory</p>
            <p className={`mt-4 text-4xl font-semibold tracking-tight ${exceptions.low_inventory_items > 0 ? "text-amber-700" : ""}`}>
              {exceptions.low_inventory_items}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Items below threshold</p>
          </Link>
        </section>
      )}

      {/* Quick nav */}
      <section className="grid gap-4 md:grid-cols-3">
        <Link
          className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm transition hover:border-primary/30"
          href="/dashboard/properties"
        >
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Properties</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">Manage listings</h2>
        </Link>

        <Link
          className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm transition hover:border-primary/30"
          href={"/dashboard/assignments" as Route}
        >
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Assignments</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">All jobs</h2>
        </Link>

        <Link
          className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm transition hover:border-primary/30"
          href={"/dashboard/assignments/new" as Route}
        >
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Schedule</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">New assignment</h2>
        </Link>

        <Link
          className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm transition hover:border-primary/30"
          href={"/dashboard/issues" as Route}
        >
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Exceptions</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">Issues & Inventory</h2>
        </Link>

        <Link
          className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm transition hover:border-primary/30"
          href={"/dashboard/calendar" as Route}
        >
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Automation</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">Calendar sync</h2>
        </Link>

        <Link
          className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm transition hover:border-primary/30"
          href={"/dashboard/notifications" as Route}
        >
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Alerts</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">Notifications</h2>
        </Link>

        <Link
          className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm transition hover:border-primary/30"
          href={"/dashboard/payouts" as Route}
        >
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Finance</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">Payout batches</h2>
        </Link>
      </section>
    </main>
  );
}
