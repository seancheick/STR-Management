import { CheckCircle2 } from "lucide-react";

import { CleanerJobCard } from "@/components/cleaner/cleaner-job-card";
import { requireRole } from "@/lib/auth/session";
import { listCleanerHistoryAssignments } from "@/lib/queries/assignments";
import { groupCleanerAssignmentsByDate } from "@/lib/services/cleaner-portal";

function formatGroupDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default async function CleanerHistoryPage() {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const assignments = await listCleanerHistoryAssignments(profile.id);
  const groups = groupCleanerAssignmentsByDate(assignments);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 py-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">History</p>
        <h1 className="text-3xl font-semibold tracking-tight">Completed jobs</h1>
      </header>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/70 px-6 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
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
