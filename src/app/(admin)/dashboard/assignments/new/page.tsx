import type { Route } from "next";
import Link from "next/link";

import { createAssignmentAction } from "@/app/(admin)/dashboard/assignments/actions";
import { NewAssignmentForm } from "@/components/assignments/new-assignment-form";
import { requireRole } from "@/lib/auth/session";
import { listProperties } from "@/lib/queries/properties";
import { listActiveCleaners } from "@/lib/queries/team";

export default async function NewAssignmentPage() {
  await requireRole(["owner", "admin"]);

  const [propertiesResult, cleaners] = await Promise.all([
    listProperties(),
    listActiveCleaners(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-3">
        <Link className="text-sm text-muted-foreground" href={"/dashboard/assignments" as Route}>
          ← Back to assignments
        </Link>
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Create assignment
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Schedule a job</h1>
        </div>
      </div>

      <section className="rounded-[1.75rem] border border-border/70 bg-card p-6 shadow-sm">
        <NewAssignmentForm
          action={createAssignmentAction}
          properties={propertiesResult.data}
          cleaners={cleaners}
        />
      </section>
    </main>
  );
}
