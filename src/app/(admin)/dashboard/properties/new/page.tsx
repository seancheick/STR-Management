import Link from "next/link";

import {
  createPropertyAction,
} from "@/app/(admin)/dashboard/properties/actions";
import { PropertyForm } from "@/components/properties/property-form";
import { requireRole } from "@/lib/auth/session";

export default async function NewPropertyPage() {
  await requireRole(["owner", "admin"]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-3">
        <Link className="text-sm text-muted-foreground" href="/dashboard/properties">
          ← Back to properties
        </Link>
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Create property
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Add a new listing
          </h1>
        </div>
      </div>

      <section className="rounded-[1.75rem] border border-border/70 bg-card p-6 shadow-sm">
        <PropertyForm action={createPropertyAction} submitLabel="Create property" />
      </section>
    </main>
  );
}

