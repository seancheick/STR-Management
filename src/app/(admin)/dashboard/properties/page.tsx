import { Building2, CheckCircle } from "lucide-react";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listProperties } from "@/lib/queries/properties";
import { PropertiesView } from "@/components/properties/properties-view";

type PropertiesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function statusMessage(status?: string, message?: string) {
  if (message) {
    return message;
  }

  switch (status) {
    case "created":
      return "Property created.";
    case "updated":
      return "Property updated.";
    case "archived":
      return "Property archived.";
    default:
      return null;
  }
}

export default async function PropertiesPage({ searchParams }: PropertiesPageProps) {
  await requireRole(["owner", "admin"]);
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : undefined;
  const message = typeof params.message === "string" ? params.message : undefined;
  const banner = statusMessage(status, message);
  const result = await listProperties();
  const activeProperties = result.data.filter((p) => p.active === true);
  const archivedProperties = result.data.filter((p) => p.active === false);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Properties</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage the homes, condos, and units that drive assignment creation and
            checklist enforcement.
          </p>
        </div>
        <Link
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-[#f7f5ef] transition-opacity hover:opacity-90"
          href="/dashboard/properties/new"
        >
          Add property
        </Link>
      </header>

      {banner ? (
        <section className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {banner}
        </section>
      ) : null}

      {result.error ? (
        <section className="rounded-2xl border border-destructive/30 bg-card p-6">
          <h2 className="text-lg font-semibold">Properties are not queryable yet</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {result.error}. Apply the migration to the hosted Supabase project, then
            reload this page.
          </p>
        </section>
      ) : activeProperties.length === 0 && archivedProperties.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/70 px-8 py-14 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <h2 className="text-xl font-semibold">No properties yet</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Add your first listing so assignment scheduling can attach to a real
              property.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-[#f7f5ef] transition-opacity hover:opacity-90"
            href="/dashboard/properties/new"
          >
            Add first property
          </Link>
        </section>
      ) : (
        <PropertiesView activeProperties={activeProperties} archivedProperties={archivedProperties} />
      )}
    </main>
  );
}
