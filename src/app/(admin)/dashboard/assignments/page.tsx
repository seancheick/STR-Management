import type { Route } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listAssignmentsForAdmin } from "@/lib/queries/assignments";

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    unassigned: "bg-yellow-50 text-yellow-700 border-yellow-200",
    assigned: "bg-blue-50 text-blue-700 border-blue-200",
    confirmed: "bg-indigo-50 text-indigo-700 border-indigo-200",
    in_progress: "bg-orange-50 text-orange-700 border-orange-200",
    completed_pending_review: "bg-purple-50 text-purple-700 border-purple-200",
    approved: "bg-green-50 text-green-700 border-green-200",
    needs_reclean: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  };
  return map[status] ?? "bg-gray-50 text-gray-600 border-gray-200";
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type AssignmentsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AssignmentsPage({ searchParams }: AssignmentsPageProps) {
  await requireRole(["owner", "admin", "supervisor"]);
  const params = (await searchParams) ?? {};
  const banner =
    typeof params.status === "string" && params.status === "created"
      ? "Assignment created."
      : null;

  const assignments = await listAssignmentsForAdmin();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Assignments</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            All cleaning jobs across your portfolio.
          </p>
        </div>
        <Link
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
          href={"/dashboard/assignments/new" as Route}
        >
          New assignment
        </Link>
      </header>

      {banner ? (
        <section className="rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm">
          {banner}
        </section>
      ) : null}

      {assignments.length === 0 ? (
        <section className="rounded-[1.5rem] border border-dashed border-border bg-card/70 p-8">
          <h2 className="text-xl font-semibold">No assignments yet</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Create your first assignment to start tracking cleaning jobs.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          {assignments.map((a) => (
            <article
              key={a.id}
              className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {a.properties?.name ?? "Unknown property"}
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
                  {formatStatus(a.status)}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Cleaner</dt>
                  <dd className="mt-1 font-medium">
                    {a.cleaners?.full_name ?? "Unassigned"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Due</dt>
                  <dd className="mt-1 font-medium">{formatDate(a.due_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Priority</dt>
                  <dd className="mt-1 font-medium capitalize">{a.priority}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Payout</dt>
                  <dd className="mt-1 font-medium">
                    {a.fixed_payout_amount !== null
                      ? `$${Number(a.fixed_payout_amount).toFixed(2)}`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
