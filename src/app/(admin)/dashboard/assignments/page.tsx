import type { Route } from "next";
import Link from "next/link";
import { CheckCircle, ClipboardList } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { listAssignmentsForAdmin } from "@/lib/queries/assignments";
import { listActiveCleaners } from "@/lib/queries/team";
import { AssignmentsList } from "@/components/assignments/assignments-list";

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

  const showCancelled = params.cancelled === "1";
  const showApproved = params.approved === "1";
  const unpaidOnly = params.unpaid === "1";

  const [allAssignments, cleaners] = await Promise.all([
    listAssignmentsForAdmin(),
    listActiveCleaners(),
  ]);

  const PAYABLE_STATUSES = new Set(["approved", "completed", "completed_pending_review"]);

  let assignments = allAssignments.filter((a) => {
    if (a.status === "cancelled") return showCancelled;
    if (a.status === "approved") return showApproved;
    return true;
  });

  if (unpaidOnly) {
    assignments = assignments.filter(
      (a) => PAYABLE_STATUSES.has(a.status) && a.paid_at === null,
    );
  }

  const cancelledCount = allAssignments.filter((a) => a.status === "cancelled").length;
  const approvedCount = allAssignments.filter((a) => a.status === "approved").length;
  const unpaidCount = allAssignments.filter(
    (a) => PAYABLE_STATUSES.has(a.status) && a.paid_at === null,
  ).length;

  function buildHref(over: {
    cancelled?: string | null;
    approved?: string | null;
    unpaid?: string | null;
  }): string {
    const entries: string[] = [];
    const cancelledVal = "cancelled" in over ? over.cancelled : showCancelled ? "1" : null;
    const approvedVal = "approved" in over ? over.approved : showApproved ? "1" : null;
    const unpaidVal = "unpaid" in over ? over.unpaid : unpaidOnly ? "1" : null;
    if (cancelledVal) entries.push(`cancelled=${cancelledVal}`);
    if (approvedVal) entries.push(`approved=${approvedVal}`);
    if (unpaidVal) entries.push(`unpaid=${unpaidVal}`);
    return entries.length > 0
      ? `/dashboard/assignments?${entries.join("&")}`
      : "/dashboard/assignments";
  }

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
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-[#f7f5ef]"
          href={"/dashboard/assignments/new" as Route}
        >
          New assignment
        </Link>
      </header>

      {banner ? (
        <section className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {banner}
        </section>
      ) : null}

      {/* Filter chips — cancelled + approved hidden by default */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="mr-1 self-center font-medium uppercase tracking-wider text-muted-foreground">
          Show
        </span>
        {[
          {
            label: "Unpaid only",
            count: unpaidCount,
            on: unpaidOnly,
            href: (unpaidOnly
              ? buildHref({ unpaid: null })
              : buildHref({ unpaid: "1" })) as Route,
          },
          {
            label: "Cancelled",
            count: cancelledCount,
            on: showCancelled,
            href: (showCancelled
              ? buildHref({ cancelled: null })
              : buildHref({ cancelled: "1" })) as Route,
          },
          {
            label: "Approved",
            count: approvedCount,
            on: showApproved,
            href: (showApproved
              ? buildHref({ approved: null })
              : buildHref({ approved: "1" })) as Route,
          },
        ].map((chip) => (
          <Link
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium transition ${
              chip.on
                ? "bg-primary text-[#f7f5ef]"
                : "border border-border/70 bg-card text-muted-foreground hover:bg-muted"
            }`}
            href={chip.href}
            key={chip.label}
          >
            {chip.label}
            {chip.count > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                  chip.on ? "bg-white/20" : "bg-muted"
                }`}
              >
                {chip.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {assignments.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-[1.75rem] border border-dashed border-border bg-card/70 px-6 py-12 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <h2 className="text-xl font-semibold">No assignments yet</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Create your first assignment to start tracking cleaning jobs.</p>
          </div>
          <Link href="/dashboard/assignments/new" className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-[#f7f5ef]">
            New assignment
          </Link>
        </section>
      ) : (
        <AssignmentsList assignments={assignments} cleaners={cleaners} />
      )}
    </main>
  );
}
