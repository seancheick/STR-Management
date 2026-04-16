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
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Sprint 1
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Properties</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage the homes, condos, and units that drive assignment creation and
            checklist enforcement.
          </p>
        </div>
        <Link
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
          href="/dashboard/properties/new"
        >
          Add property
        </Link>
      </header>

      {banner ? (
        <section className="rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm">
          {banner}
        </section>
      ) : null}

      {result.error ? (
        <section className="rounded-[1.5rem] border border-destructive/30 bg-card p-6">
          <h2 className="text-lg font-semibold">Properties are not queryable yet</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {result.error}. Apply the Sprint 1 migration to the hosted Supabase project,
            then reload this page.
          </p>
        </section>
      ) : result.data.length === 0 ? (
        <section className="rounded-[1.5rem] border border-dashed border-border bg-card/70 p-8">
          <h2 className="text-xl font-semibold">No properties yet</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Start by adding your first listing so assignment scheduling can attach to a
            real property.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {result.data.map((property) => (
            <article
              key={property.id}
              className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{property.name}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {[property.address_line_1, property.city, property.state]
                      .filter(Boolean)
                      .join(", ") || "Address pending"}
                  </p>
                </div>
                <span className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
                  {property.active ? "Active" : "Archived"}
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Bedrooms</dt>
                  <dd className="mt-1 font-medium">{property.bedrooms ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Bathrooms</dt>
                  <dd className="mt-1 font-medium">{property.bathrooms ?? "—"}</dd>
                </div>
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

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-full border border-border/70 px-4 text-sm font-medium"
                  href={`/dashboard/properties/${property.id}/edit`}
                >
                  Edit
                </Link>
                {property.active ? (
                  <form action={archivePropertyAction.bind(null, property.id)}>
                    <button
                      className="inline-flex h-10 items-center justify-center rounded-full border border-border/70 px-4 text-sm font-medium text-muted-foreground"
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

