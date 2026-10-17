import Link from "next/link";
import type { Route } from "next";
import { CheckCircle2 } from "lucide-react";

import { CleanerJobCard } from "@/components/cleaner/cleaner-job-card";
import { requireRole } from "@/lib/auth/session";
import { listCleanerHistoryAssignments } from "@/lib/queries/assignments";
import { groupCleanerAssignmentsByDate } from "@/lib/services/cleaner-portal";

function formatGroupDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function CleanerHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const profile = await requireRole([
    "cleaner",
    "owner",
    "admin",
    "supervisor",
  ]);
  const params = await searchParams;
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  const records = await listCleanerHistoryAssignments(profile.cleanerId??profile.id, page);
  const hasNext = records.length > 25;
  const assignments = records.slice(0, 25);
  const groups = groupCleanerAssignmentsByDate(assignments, "desc");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Completed jobs
        </h1>
        <p className="text-sm text-muted-foreground">
          Newest first · Up to 25 jobs per page
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/70 px-6 py-12 text-center">
          <CheckCircle2
            className="h-10 w-10 text-muted-foreground/40"
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold">No history yet</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Completed jobs will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section
              className="rounded-2xl border border-border bg-card px-4 py-3"
              key={group.dateKey}
            >
              <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
                {formatGroupDate(group.dateKey)}
              </h2>
              {group.assignments.map((assignment) => (
                <CleanerJobCard
                  assignment={assignment}
                  key={assignment.id}
                  compact
                />
              ))}
            </section>
          ))}
        </div>
      )}
      <nav
        aria-label="Job history pages"
        className="flex items-center justify-between gap-3 text-sm"
      >
        {page > 1 ? (
          <Link
            className="inline-flex min-h-11 items-center underline"
            href={`/jobs/history?page=${page - 1}` as Route}
          >
            Newer jobs
          </Link>
        ) : (
          <span>Newest jobs</span>
        )}
        <span>Page {page}</span>
        {hasNext && (
          <Link
            className="inline-flex min-h-11 items-center underline"
            href={`/jobs/history?page=${page + 1}` as Route}
          >
            Older jobs
          </Link>
        )}
      </nav>
    </main>
  );
}
