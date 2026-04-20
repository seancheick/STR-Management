import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, CheckCircle2 } from "lucide-react";

import { CleanerJobCard } from "@/components/cleaner/cleaner-job-card";
import { requireRole } from "@/lib/auth/session";
import { listCleanerPortalAssignments } from "@/lib/queries/assignments";
import { getCleanerAssignmentBuckets } from "@/lib/services/cleaner-portal";

export default async function CleanerJobsPage() {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const assignments = await listCleanerPortalAssignments(profile.id);
  const buckets = getCleanerAssignmentBuckets(assignments);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 py-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Cleaner portal</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Jobs, {profile.full_name.split(" ")[0]}
        </h1>
      </header>

      {buckets.active.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/70 px-6 py-12 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
          <div>
            <p className="font-semibold">No active jobs</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Upcoming work is available in your schedule.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-[#f7f5ef]"
            href={"/jobs/schedule" as Route}
          >
            View schedule
          </Link>
        </div>
      ) : (
        <section className="flex flex-col gap-4" aria-label="Active jobs">
          {buckets.active.map((assignment) => (
            <CleanerJobCard
              assignment={assignment}
              key={assignment.id}
              showActions
            />
          ))}
        </section>
      )}

      {buckets.history.length > 0 && (
        <section className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
            <p className="text-sm font-medium text-green-800">
              {buckets.history.length} completed job{buckets.history.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            className="mt-3 inline-flex text-sm font-medium text-green-700 underline-offset-2 hover:underline"
            href={"/jobs/history" as Route}
          >
            View history
          </Link>
        </section>
      )}
    </main>
  );
}
