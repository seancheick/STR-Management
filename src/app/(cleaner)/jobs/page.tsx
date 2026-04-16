import type { Route } from "next";
import Link from "next/link";
import { CalendarDays, Clock, MapPin } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { listAssignmentsForCleaner } from "@/lib/queries/assignments";
import { acceptJobAction, startJobAction } from "@/app/(cleaner)/jobs/actions";
import { SignOutButton } from "@/components/auth/sign-out-button";

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

function statusBarClass(status: string) {
  const map: Record<string, string> = {
    assigned: "bg-yellow-400",
    confirmed: "bg-blue-400",
    in_progress: "bg-orange-400",
    completed_pending_review: "bg-purple-400",
  };
  return map[status] ?? "bg-gray-300";
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
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Your jobs, {profile.full_name.split(" ")[0]}
          </h1>
        </div>
        <SignOutButton />
      </header>

      {assignments.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/70 px-6 py-12 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-semibold">No active jobs</p>
            <p className="mt-1 text-sm text-muted-foreground leading-6">
              New assignments will appear here once they&apos;re scheduled.
            </p>
          </div>
        </div>
      ) : (
        <section className="flex flex-col gap-4">
          {assignments.map((a) => (
            <article
              key={a.id}
              className="rounded-2xl border border-border/70 bg-card shadow-sm transition duration-200 hover:shadow-md overflow-hidden"
            >
              <div className={`h-1 w-full ${statusBarClass(a.status)}`} />
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold tracking-tight">
                      {a.properties?.name ?? "Property"}
                    </h2>
                    {a.properties?.address_line_1 && (
                      <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {[a.properties.address_line_1, a.properties.city]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(a.status)}`}
                  >
                    {statusLabel(a.status)}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">{formatDate(a.due_at)}</span>
                </div>

                <div className="mt-5 flex flex-col gap-3">
                  {a.status === "assigned" && (
                    <form action={async () => { await acceptJobAction(a.id); }}>
                      <button
                        className="w-full h-12 rounded-xl bg-primary text-[#f7f5ef] text-sm font-semibold"
                        type="submit"
                      >
                        Accept
                      </button>
                    </form>
                  )}

                  {a.status === "confirmed" && (
                    <form action={async () => { await startJobAction(a.id); }}>
                      <button
                        className="w-full h-12 rounded-xl bg-primary text-[#f7f5ef] text-sm font-semibold"
                        type="submit"
                      >
                        Start job
                      </button>
                    </form>
                  )}

                  {a.status === "in_progress" && (
                    <Link
                      className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[#f7f5ef] text-sm font-semibold"
                      href={`/jobs/${a.id}` as Route}
                    >
                      Execute checklist
                    </Link>
                  )}

                  {a.status === "completed_pending_review" && (
                    <Link
                      className="flex h-12 w-full items-center justify-center rounded-xl border border-border/70 bg-transparent text-sm font-medium"
                      href={`/jobs/${a.id}` as Route}
                    >
                      View submission
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
