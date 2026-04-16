import type { Route } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listAssignmentsForCleaner } from "@/lib/queries/assignments";
import { acceptJobAction, startJobAction } from "@/app/(cleaner)/jobs/actions";

function statusLabel(status: string) {
  const map: Record<string, string> = {
    assigned: "Pending acceptance",
    confirmed: "Accepted — ready to start",
    in_progress: "In progress",
    completed_pending_review: "Submitted for review",
  };
  return map[status] ?? status;
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    assigned: "bg-yellow-50 text-yellow-700 border-yellow-200",
    confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-orange-50 text-orange-700 border-orange-200",
    completed_pending_review: "bg-purple-50 text-purple-700 border-purple-200",
  };
  return map[status] ?? "bg-gray-50 text-gray-600 border-gray-200";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function CleanerJobsPage() {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const assignments = await listAssignmentsForCleaner(profile.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
          Cleaner
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Your jobs, {profile.full_name.split(" ")[0]}
        </h1>
      </header>

      {assignments.length === 0 ? (
        <section className="rounded-[1.5rem] border border-dashed border-border bg-card/70 p-6">
          <p className="text-sm font-medium">No active jobs.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            New assignments will appear here once they&apos;re scheduled.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          {assignments.map((a) => (
            <article
              key={a.id}
              className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {a.properties?.name ?? "Property"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {a.properties
                      ? [a.properties.address_line_1, a.properties.city]
                          .filter(Boolean)
                          .join(", ")
                      : null}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(a.status)}`}
                >
                  {statusLabel(a.status)}
                </span>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                Due: <span className="font-medium text-foreground">{formatDate(a.due_at)}</span>
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                {a.status === "assigned" && (
                  <form action={async () => { await acceptJobAction(a.id); }}>
                    <button
                      className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
                      type="submit"
                    >
                      Accept
                    </button>
                  </form>
                )}

                {a.status === "confirmed" && (
                  <form action={async () => { await startJobAction(a.id); }}>
                    <button
                      className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
                      type="submit"
                    >
                      Start job
                    </button>
                  </form>
                )}

                {a.status === "in_progress" && (
                  <Link
                    className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
                    href={`/jobs/${a.id}` as Route}
                  >
                    Execute checklist
                  </Link>
                )}

                {a.status === "completed_pending_review" && (
                  <Link
                    className="inline-flex h-10 items-center justify-center rounded-full border border-border/70 px-5 text-sm font-medium"
                    href={`/jobs/${a.id}` as Route}
                  >
                    View submission
                  </Link>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
