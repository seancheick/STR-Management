"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, DollarSign, Loader2 } from "lucide-react";

import { bulkMarkPaidAction } from "@/app/(admin)/dashboard/schedule/actions";
import type { AssignmentListRecord } from "@/lib/queries/assignments";
import { showToast } from "@/components/ui/toast";

const METHODS = [
  { value: "zelle", label: "Zelle" },
  { value: "venmo", label: "Venmo" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
] as const;

export function BulkMarkPaid({ jobs }: { jobs: AssignmentListRecord[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"] | "">("");
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { cleanerName: string; items: AssignmentListRecord[]; total: number }
    >();
    for (const j of jobs) {
      const key = j.cleaner_id ?? "__unassigned";
      const name = j.cleaners?.full_name ?? "Unassigned";
      if (!map.has(key)) map.set(key, { cleanerName: name, items: [], total: 0 });
      const group = map.get(key)!;
      group.items.push(j);
      group.total += Number(j.fixed_payout_amount ?? 0);
    }
    return Array.from(map.values()).sort((a, b) => a.cleanerName.localeCompare(b.cleanerName));
  }, [jobs]);

  const selectedTotal = useMemo(
    () =>
      jobs
        .filter((j) => selected.has(j.id))
        .reduce((sum, j) => sum + Number(j.fixed_payout_amount ?? 0), 0),
    [jobs, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(items: AssignmentListRecord[], allSelected: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of items) {
        if (allSelected) next.delete(i.id);
        else next.add(i.id);
      }
      return next;
    });
  }

  function handleSubmit() {
    if (!method || selected.size === 0) return;
    startTransition(async () => {
      const result = await bulkMarkPaidAction({
        assignmentIds: Array.from(selected),
        paymentMethod: method,
        paymentReference: reference,
      });
      if (!result.ok) {
        showToast(result.error ?? "Could not mark paid.", "error");
        return;
      }
      const n = result.count ?? selected.size;
      showToast(`Marked ${n} job${n === 1 ? "" : "s"} paid.`, "success");
      setSelected(new Set());
      setMethod("");
      setReference("");
    });
  }

  if (jobs.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
        Every completed cleaning has been paid.
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Quick-pay · unpaid cleanings</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Select a few jobs, pick how you paid, and mark them off the list.
            This is separate from the batch-payout CSV flow below.
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium tabular-nums">
          {jobs.length} unpaid · ${jobs.reduce((s, j) => s + Number(j.fixed_payout_amount ?? 0), 0).toFixed(2)}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const allSelected = g.items.every((i) => selected.has(i.id));
          const someSelected = !allSelected && g.items.some((i) => selected.has(i.id));
          return (
            <div className="rounded-xl border border-border/60 bg-background/60 p-3" key={g.cleanerName}>
              <label className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <input
                    checked={allSelected}
                    onChange={() => toggleGroup(g.items, allSelected)}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    type="checkbox"
                  />
                  <span className="text-sm font-semibold">{g.cleanerName}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.items.length} job{g.items.length === 1 ? "" : "s"} · ${g.total.toFixed(2)}
                  </span>
                </span>
              </label>
              <ul className="mt-2 space-y-1">
                {g.items.map((j) => {
                  const date = new Date(j.due_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                  return (
                    <li key={j.id}>
                      <label className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60">
                        <span className="flex min-w-0 items-center gap-2">
                          <input
                            checked={selected.has(j.id)}
                            onChange={() => toggle(j.id)}
                            type="checkbox"
                          />
                          <span className="truncate">{j.properties?.name ?? "Property"}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">· {date}</span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">
                          ${Number(j.fixed_payout_amount ?? 0).toFixed(2)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/60 p-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-end">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="bulk-method">
              Method
            </label>
            <select
              className="h-10 w-40 rounded-xl border border-input bg-background px-3 text-sm"
              id="bulk-method"
              onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number]["value"])}
              value={method}
            >
              <option value="">Pick one…</option>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="bulk-reference">
              Reference <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
            </label>
            <input
              className="h-10 w-64 rounded-xl border border-input bg-background px-3 text-sm"
              id="bulk-reference"
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. Zelle batch #1234"
              value={reference}
            />
          </div>
        </div>

        <button
          className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-95 disabled:opacity-60"
          disabled={pending || selected.size === 0 || !method}
          onClick={handleSubmit}
          type="button"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
          Mark {selected.size > 0 ? selected.size : ""} paid · ${selectedTotal.toFixed(2)}
        </button>
      </div>
    </section>
  );
}
