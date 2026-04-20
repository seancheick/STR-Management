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

  const [assignments, cleaners] = await Promise.all([
    listAssignmentsForAdmin(),
    listActiveCleaners(),
  ]);

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
