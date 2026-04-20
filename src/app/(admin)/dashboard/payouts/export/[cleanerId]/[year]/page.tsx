import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { listCleanerPayoutsForYear } from "@/lib/queries/payouts";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/payouts/print-button";

type Props = {
  params: Promise<{ cleanerId: string; year: string }>;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AnnualPayoutExportPage({ params }: Props) {
  await requireRole(["owner", "admin"]);
  const { cleanerId, year: yearStr } = await params;
  const year = parseInt(yearStr, 10);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data: cleaner } = await supabase
    .from("users")
    .select("id, full_name, email, phone, is_1099_contractor")
    .eq("id", cleanerId)
    .maybeSingle();

  if (!cleaner) notFound();

  const entries = await listCleanerPayoutsForYear(cleanerId, year);

  const byProperty = new Map<
    string,
    { name: string; count: number; total: number }
  >();
  let grandTotal = 0;
  for (const e of entries) {
    const propertyName = e.properties?.name ?? "—";
    const amt = Number(e.amount);
    grandTotal += amt;
    const row = byProperty.get(propertyName) ?? {
      name: propertyName,
      count: 0,
      total: 0,
    };
    row.count += 1;
    row.total += amt;
    byProperty.set(propertyName, row);
  }
  const propertyRows = Array.from(byProperty.values()).sort(
    (a, b) => b.total - a.total,
  );

  return (
    <main className="mx-auto max-w-3xl px-8 py-12 print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { size: letter; margin: 0.6in; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-hide { display: none !important; }
        }
      `}</style>

      <header className="flex items-end justify-between border-b-2 border-foreground pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Payout statement
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            {cleaner.full_name} · {year}
          </h1>
          {cleaner.is_1099_contractor && (
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-amber-700">
              1099-NEC contractor
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{cleaner.email}</p>
          {cleaner.phone && (
            <p className="text-xs text-muted-foreground">{cleaner.phone}</p>
          )}
        </div>
      </header>

      <section className="mt-8 grid grid-cols-3 gap-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Jobs</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{entries.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Properties
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{propertyRows.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            ${grandTotal.toFixed(2)}
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          By property
        </h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/40">
              <th className="py-2 text-left font-medium">Property</th>
              <th className="py-2 text-right font-medium">Jobs</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {propertyRows.map((r) => (
              <tr className="border-b border-border/50" key={r.name}>
                <td className="py-2">{r.name}</td>
                <td className="py-2 text-right tabular-nums">{r.count}</td>
                <td className="py-2 text-right tabular-nums">${r.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          All jobs
        </h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/40">
              <th className="py-2 text-left font-medium">Date</th>
              <th className="py-2 text-left font-medium">Property</th>
              <th className="py-2 text-left font-medium">Type</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr className="border-b border-border/50" key={e.id}>
                <td className="py-2 tabular-nums text-muted-foreground">
                  {e.assignments?.due_at ? formatDate(e.assignments.due_at) : "—"}
                </td>
                <td className="py-2">{e.properties?.name ?? "—"}</td>
                <td className="py-2 capitalize text-muted-foreground">
                  {e.assignments?.assignment_type?.replace(/_/g, " ") ?? "cleaning"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  ${Number(e.amount).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-foreground">
              <td className="py-3" colSpan={3}>
                <span className="font-semibold">Grand total</span>
              </td>
              <td className="py-3 text-right text-lg font-semibold tabular-nums">
                ${grandTotal.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <footer className="mt-12 border-t border-border/40 pt-4 text-xs text-muted-foreground">
        <p>
          Generated {new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}{" "}
          · This is a record of payments made by your host for cleaning services
          provided in {year}.
          {cleaner.is_1099_contractor &&
            " Use this total when preparing your 1099-NEC."}
        </p>
      </footer>

      <div className="print-hide mt-10 flex gap-3">
        <PrintButton />
      </div>
    </main>
  );
}
