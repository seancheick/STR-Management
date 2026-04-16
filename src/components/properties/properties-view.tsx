"use client";

import { LayoutGrid, List, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

import { archivePropertyAction } from "@/app/(admin)/dashboard/properties/actions";
import type { PropertyRecord } from "@/lib/queries/properties";

type ViewMode = "grid" | "list";

const STORAGE_KEY = "props-view";

function bedbathLabel(bedrooms: number | null, bathrooms: number | null) {
  const bed = bedrooms != null ? `${bedrooms} bed` : null;
  const bath = bathrooms != null ? `${bathrooms} bath` : null;
  if (bed && bath) return `${bed} · ${bath}`;
  return bed ?? bath ?? null;
}

function ActiveBadge() {
  return (
    <span className="shrink-0 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
      Active
    </span>
  );
}

function ArchivedBadge() {
  return (
    <span className="shrink-0 rounded-full border border-border/60 bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
      Archived
    </span>
  );
}

function PropertyCard({ property }: { property: PropertyRecord }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card shadow-sm transition duration-200 hover:border-primary/40 hover:shadow-md">
      <Link href={`/dashboard/properties/${property.id}/edit`} className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{property.name}</h2>
            <p className="mt-1.5 truncate text-sm text-muted-foreground">
              {[property.address_line_1, property.city, property.state]
                .filter(Boolean)
                .join(", ") || "Address pending"}
            </p>
          </div>
          {property.active ? <ActiveBadge /> : <ArchivedBadge />}
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
  );
}

function PropertyRow({ property }: { property: PropertyRecord }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card shadow-sm transition duration-200 hover:border-primary/40 hover:shadow-md">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{property.name}</h2>
        </div>
        <p className="hidden truncate text-sm text-muted-foreground sm:block sm:max-w-[220px]">
          {[property.address_line_1, property.city, property.state]
            .filter(Boolean)
            .join(", ") || "Address pending"}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          {property.active ? <ActiveBadge /> : <ArchivedBadge />}
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
      </div>
    </article>
  );
}

type PropertiesViewProps = {
  activeProperties: PropertyRecord[];
  archivedProperties: PropertyRecord[];
};

export function PropertiesView({ activeProperties, archivedProperties }: PropertiesViewProps) {
  const [view, setView] = useState<ViewMode>("grid");
  const [archivedOpen, setArchivedOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "grid" || stored === "list") {
        setView(stored);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  function handleViewChange(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* View toggle */}
      <div className="flex items-center justify-end">
        <div className="inline-flex rounded-full border border-border/70 bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => handleViewChange("grid")}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
              view === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Grid
          </button>
          <button
            type="button"
            onClick={() => handleViewChange("list")}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
        </div>
      </div>

      {/* Active properties */}
      {view === "grid" ? (
        <section className="grid gap-4 md:grid-cols-2">
          {activeProperties.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          {activeProperties.map((property) => (
            <PropertyRow key={property.id} property={property} />
          ))}
        </section>
      )}

      {/* Archived section */}
      {archivedProperties.length > 0 ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setArchivedOpen((o) => !o)}
            className="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {archivedOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            Archived ({archivedProperties.length})
          </button>

          {archivedOpen ? (
            view === "grid" ? (
              <section className="grid gap-4 md:grid-cols-2">
                {archivedProperties.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </section>
            ) : (
              <section className="flex flex-col gap-3">
                {archivedProperties.map((property) => (
                  <PropertyRow key={property.id} property={property} />
                ))}
              </section>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
