import { Building2, CheckCircle } from "lucide-react";
import Link from "next/link";

import { archivePropertyAction } from "@/app/(admin)/dashboard/properties/actions";
import { requireRole } from "@/lib/auth/session";
import { listProperties } from "@/lib/queries/properties";

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

function bedbathLabel(bedrooms: number | null, bathrooms: number | null) {
  const bed = bedrooms != null ? `${bedrooms} bed` : null;
  const bath = bathrooms != null ? `${bathrooms} bath` : null;
  if (bed && bath) return `${bed} · ${bath}`;
  return bed ?? bath ?? null;
}

export default async function PropertiesPage({ searchParams }: PropertiesPageProps) {
  await requireRole(["owner", "admin"]);
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : undefined;
  const message = typeof params.message === "string" ? params.message : undefined;
  const banner = statusMessage(status, message);
  const result = await listProperties();

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
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
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
      ) : result.data.length === 0 ? (
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
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            href="/dashboard/properties/new"
          >
            Add first property
          </Link>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {result.data.map((property) => (
            <article
              key={property.id}
              className="rounded-2xl border border-border/70 bg-card shadow-sm transition duration-200 hover:border-primary/40 hover:shadow-md"
            >
              <Link
                href={`/dashboard/properties/${property.id}/edit`}
                className="block p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold">{property.name}</h2>
                    <p className="mt-1.5 truncate text-sm text-muted-foreground">
                      {[property.address_line_1, property.city, property.state]
                        .filter(Boolean)
                        .join(", ") || "Address pending"}
                    </p>
                  </div>
                  {property.active ? (
                    <span className="shrink-0 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                      Active
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                      Archived
                    </span>
                  )}
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  {bedbathLabel(property.bedrooms, property.bathrooms) ? (
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Beds &amp; baths</dt>
                      <dd className="mt-1 font-medium">
                        {bedbathLabel(property.bedrooms, property.bathrooms)}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">Default price</dt>
                    <dd className="mt-1 font-medium">
                      {property.default_clean_price !== null
                        ? `$${Number(property.default_clean_price).toFixed(2)}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Difficulty</dt>
                    <dd className="mt-1 font-medium">{property.difficulty_score ?? "—"}</dd>
                  </div>
                </dl>
              </Link>

              <div className="flex gap-3 border-t border-border/50 px-5 py-4">
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-full border border-border/70 px-4 text-sm font-medium transition duration-200 hover:border-primary/40 hover:text-primary"
                  href={`/dashboard/properties/${property.id}/edit`}
                >
                  Edit
                </Link>
                {property.active ? (
                  <form action={archivePropertyAction.bind(null, property.id)}>
                    <button
                      className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full border border-border/70 px-4 text-sm font-medium text-muted-foreground transition duration-200 hover:border-destructive/40 hover:text-destructive"
                      type="submit"
                    >
                      Archive
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
