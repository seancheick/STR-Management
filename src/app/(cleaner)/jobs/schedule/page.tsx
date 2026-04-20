import { CalendarDays } from "lucide-react";

import { CleanerJobCard } from "@/components/cleaner/cleaner-job-card";
import { requireRole } from "@/lib/auth/session";
import { listCleanerPortalAssignments } from "@/lib/queries/assignments";
import {
  getCleanerAssignmentBuckets,
  groupCleanerAssignmentsByDate,
} from "@/lib/services/cleaner-portal";

function formatGroupDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default async function CleanerSchedulePage() {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const assignments = await listCleanerPortalAssignments(profile.id);
  const buckets = getCleanerAssignmentBuckets(assignments);
  const groups = groupCleanerAssignmentsByDate([...buckets.active, ...buckets.schedule]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 py-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Schedule</p>
        <h1 className="text-3xl font-semibold tracking-tight">Upcoming work</h1>
      </header>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/70 px-6 py-12 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
          <div>
            <p className="font-semibold">No scheduled jobs</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              New assignments will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section className="flex flex-col gap-3" key={group.dateKey}>
              <h2 className="text-sm font-semibold text-muted-foreground">
                {formatGroupDate(group.dateKey)}
              </h2>
              {group.assignments.map((assignment) => (
                <CleanerJobCard assignment={assignment} key={assignment.id} showActions />
              ))}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
