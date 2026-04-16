import type { Route } from "next";
import Link from "next/link";
import { AlertTriangle, Package, PackageSearch, CheckCircle2 } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { listOpenIssues, listPendingRestockRequests, listLowInventory } from "@/lib/queries/issues";
import { IssueActionButtons } from "@/components/issues/issue-action-buttons";
import { RestockActionButtons } from "@/components/issues/restock-action-buttons";

const severityColors: Record<string, string> = {
  low: "bg-slate-50 text-slate-600 border border-slate-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  high: "bg-orange-50 text-orange-700 border border-orange-200",
  critical: "bg-red-50 text-red-700 border border-red-200",
};

const severityAccent: Record<string, string> = {
  critical: "border-l-2 border-l-red-400",
  high: "border-l-2 border-l-orange-400",
};

const typeLabels: Record<string, string> = {
  cleaning: "Cleaning",
  maintenance: "Maintenance",
  damage: "Damage",
  inventory: "Inventory",
  access: "Access",
  other: "Other",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function IssuesPage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const [issues, restockRequests, lowInventory] = await Promise.all([
    listOpenIssues(),
    listPendingRestockRequests(),
    listLowInventory(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Exceptions</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Issues & Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track and resolve cleaning issues, restock needs, and inventory levels.
        </p>
      </div>

      {/* Open Issues */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Open issues
          </h2>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums">
            {issues.length}
          </span>
        </div>

        {issues.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[1.75rem] border border-dashed border-border bg-card/70 p-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500/60" />
            <p className="font-medium">All clear</p>
            <p className="text-sm text-muted-foreground">No open issues right now.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className={`rounded-2xl border border-border/70 bg-card p-5 shadow-sm ${severityAccent[issue.severity] ?? ""}`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${severityColors[issue.severity] ?? "bg-muted text-muted-foreground border border-border"}`}
                      >
                        {issue.severity}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {typeLabels[issue.issue_type] ?? issue.issue_type}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">
                        {issue.properties?.name ?? "Unknown property"}
                      </span>
                    </div>
                    <p className="font-medium">{issue.title}</p>
                    {issue.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {issue.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Reported by {issue.reported_by?.full_name ?? "Unknown"} ·{" "}
                      {formatDate(issue.created_at)}
                    </p>
                  </div>
                  <IssueActionButtons issueId={issue.id} currentStatus={issue.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending Restock Requests */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Package className="h-5 w-5 text-blue-500" />
            Restock requests
          </h2>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums">
            {restockRequests.length}
          </span>
        </div>

        {restockRequests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[1.75rem] border border-dashed border-border bg-card/70 p-10 text-center">
            <Package className="h-8 w-8 text-muted-foreground/40" />
            <p className="font-medium">Nothing pending</p>
            <p className="text-sm text-muted-foreground">
              Restock requests from cleaners appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {restockRequests.map((req) => (
              <div
                key={req.id}
                className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-medium">
                      {req.inventory_item?.name ?? "Unknown item"} ×{req.quantity_needed}{" "}
                      {req.inventory_item?.unit}
                    </p>
                    {req.notes && (
                      <p className="text-sm text-muted-foreground">{req.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(req.created_at)}
                    </p>
                  </div>
                  <RestockActionButtons requestId={req.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Low inventory */}
      {lowInventory.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <PackageSearch className="h-5 w-5 text-amber-500" />
            Low inventory
          </h2>
          <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <ul className="divide-y divide-border/60">
              {lowInventory.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <span className="font-medium">{item.item_name}</span>
                    <span className="ml-2 text-muted-foreground">· {item.property_name}</span>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200 tabular-nums">
                    {item.current_quantity}/{item.reorder_threshold} {item.unit}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Manage inventory levels in each{" "}
              <Link
                className="underline underline-offset-2 text-foreground/70 hover:text-foreground transition-colors"
                href={"/dashboard/properties" as Route}
              >
                property
              </Link>
              .
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
