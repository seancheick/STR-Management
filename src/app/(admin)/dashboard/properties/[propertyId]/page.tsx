import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Bed, Bath, ClipboardList, Package, Pencil } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { getProperty } from "@/lib/queries/properties";
import { listAssignmentsForAdmin } from "@/lib/queries/assignments";

type PropertyPageProps = {
  params: Promise<{ propertyId: string }>;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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

export default async function PropertyDetailPage({ params }: PropertyPageProps) {
  await requireRole(["owner", "admin"]);
  const { propertyId } = await params;

  const [propertyResult, allAssignments] = await Promise.all([
    getProperty(propertyId),
    listAssignmentsForAdmin(),
  ]);

  if (!propertyResult.data) notFound();

  const property = propertyResult.data;
  const assignments = allAssignments
    .filter((a) => a.property_id === propertyId)
    .slice(0, 10);

  const activeAssignments = assignments.filter(
    (a) => !["approved", "cancelled"].includes(a.status),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      {/* Breadcrumb + header */}
      <div className="flex flex-col gap-3">
        <Link className="text-sm text-muted-foreground hover:text-foreground" href="/dashboard/properties">
          ← Back to properties
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Property</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{property.name}</h1>
            {(property.address_line_1 || property.city) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {[property.address_line_1, property.city, property.state]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </div>
          <Link
            href={`/dashboard/properties/${propertyId}/edit` as Route}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-card px-4 text-sm font-medium transition hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
        </div>
      </div>

      {/* Details card */}
      <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          {property.bedrooms !== null && (
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Bed className="h-3.5 w-3.5" /> Bedrooms
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{property.bedrooms}</dd>
            </div>
          )}
          {property.bathrooms !== null && (
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Bath className="h-3.5 w-3.5" /> Bathrooms
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{property.bathrooms}</dd>
            </div>
          )}
          {property.default_clean_price !== null && (
            <div>
              <dt className="text-xs text-muted-foreground">Default payout</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                ${Number(property.default_clean_price).toFixed(2)}
              </dd>
            </div>
          )}
          {property.difficulty_score !== null && (
            <div>
              <dt className="text-xs text-muted-foreground">Difficulty</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {property.difficulty_score}/5
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* Quick links */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          {
            href: `/dashboard/assignments/new?propertyId=${propertyId}`,
            icon: ClipboardList,
            label: "New assignment",
            sub: "Schedule a cleaning",
          },
          {
            href: `/dashboard/properties/${propertyId}/inventory`,
            icon: Package,
            label: "Inventory",
            sub: "Manage supplies",
          },
          {
            href: `/dashboard/properties/${propertyId}/edit`,
            icon: Pencil,
            label: "Edit property",
            sub: "Update details",
          },
        ].map(({ href, icon: Icon, label, sub }) => (
          <Link
            key={href}
            href={href as Route}
            className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-4 transition hover:border-primary/30 hover:shadow-sm"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/40" />
          </Link>
        ))}
      </section>

      {/* Recent assignments */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Recent assignments
            {activeAssignments.length > 0 && (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {activeAssignments.length} active
              </span>
            )}
          </h2>
          <Link
            href={"/dashboard/assignments" as Route}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-2"
          >
            All assignments <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/70 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">No assignments yet for this property.</p>
            <Link
              href={`/dashboard/assignments/new?propertyId=${propertyId}` as Route}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-[#f7f5ef]"
            >
              Create first assignment
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {assignments.map((a) => (
              <article
                key={a.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card px-5 py-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{formatDate(a.due_at)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.cleaners?.full_name ?? "Unassigned"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(a.status)}`}
                >
                  {formatStatus(a.status)}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
