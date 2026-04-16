import type { Route } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listOpenIssues, listPendingRestockRequests, listLowInventory } from "@/lib/queries/issues";
import { IssueActionButtons } from "@/components/issues/issue-action-buttons";
import { RestockActionButtons } from "@/components/issues/restock-action-buttons";

const severityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
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
      </div>

      {/* Open Issues */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Open issues</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
            {issues.length}
          </span>
        </div>

        {issues.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-border bg-card/70 p-6">
            <p className="text-sm text-muted-foreground">No open issues.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityColors[issue.severity] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {issue.severity}
                      </span>
                      <span className="text-xs text-muted-foreground">
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
          <h2 className="text-xl font-semibold">Restock requests</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
            {restockRequests.length}
          </span>
        </div>

        {restockRequests.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-border bg-card/70 p-6">
            <p className="text-sm text-muted-foreground">No pending restock requests.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {restockRequests.map((req) => (
              <div
                key={req.id}
                className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm"
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
          <h2 className="text-xl font-semibold">Low inventory</h2>
          <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5">
            <ul className="divide-y divide-amber-100">
              {lowInventory.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <span className="font-medium">{item.item_name}</span>
                    <span className="ml-2 text-muted-foreground">· {item.property_name}</span>
                  </div>
                  <span className="font-semibold text-amber-700">
                    {item.current_quantity}/{item.reorder_threshold} {item.unit}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-amber-700">
              Manage inventory levels in each{" "}
              <Link
                className="underline underline-offset-2"
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
