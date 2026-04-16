import { requireRole } from "@/lib/auth/session";
import { listMyPayoutEntries } from "@/lib/queries/payouts";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function EarningsPage() {
  const profile = await requireRole(["cleaner"]);
  const entries = await listMyPayoutEntries(profile.id);

  const total = entries.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-8">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
          My Earnings
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          ${total.toFixed(2)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {entries.length} job{entries.length !== 1 ? "s" : ""} in approved /
          paid batches
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No earnings records yet.
        </p>
      ) : (
        <section className="flex flex-col gap-3">
          {entries.map((e) => (
            <article
              key={e.id}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-card px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {e.properties?.name ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.assignments?.due_at
                    ? formatDate(e.assignments.due_at)
                    : "—"}
                  {" · "}
                  {e.assignments?.assignment_type?.replace(/_/g, " ") ?? "—"}
                </p>
              </div>
              <p className="text-sm font-semibold">
                ${Number(e.amount).toFixed(2)}
              </p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
