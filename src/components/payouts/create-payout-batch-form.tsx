"use client";

import { useActionState, useMemo, useRef, useState } from "react";

import { createPayoutBatchAction } from "@/app/(admin)/dashboard/payouts/actions";

type Cleaner = { id: string; full_name: string };

type Props = {
  cleaners: Cleaner[];
};

const initialState = { error: null as string | null };

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // snap to Monday
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeek(d: Date): Date {
  const copy = startOfWeek(d);
  copy.setDate(copy.getDate() + 6);
  return copy;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function CreatePayoutBatchForm({ cleaners }: Props) {
  const [state, action, isPending] = useActionState(
    createPayoutBatchAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  const today = useMemo(() => new Date(), []);
  const [cleanerId, setCleanerId] = useState("");
  const [periodStart, setPeriodStart] = useState(ymd(startOfMonth(today)));
  const [periodEnd, setPeriodEnd] = useState(ymd(endOfMonth(today)));
  const [label, setLabel] = useState("");

  const cleanerName = cleaners.find((c) => c.id === cleanerId)?.full_name;
  const autoLabel = useMemo(() => {
    const who = cleanerName ?? "All cleaners";
    const monthlyMatch =
      periodStart === ymd(startOfMonth(new Date(periodStart))) &&
      periodEnd === ymd(endOfMonth(new Date(periodStart)));
    const period = monthlyMatch
      ? monthLabel(new Date(periodStart))
      : `${periodStart} → ${periodEnd}`;
    return `${who} · ${period}`;
  }, [cleanerName, periodStart, periodEnd]);

  function applyPreset(kind: "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth") {
    if (kind === "thisWeek") {
      setPeriodStart(ymd(startOfWeek(today)));
      setPeriodEnd(ymd(endOfWeek(today)));
    } else if (kind === "lastWeek") {
      const ref = new Date(today);
      ref.setDate(ref.getDate() - 7);
      setPeriodStart(ymd(startOfWeek(ref)));
      setPeriodEnd(ymd(endOfWeek(ref)));
    } else if (kind === "thisMonth") {
      setPeriodStart(ymd(startOfMonth(today)));
      setPeriodEnd(ymd(endOfMonth(today)));
    } else {
      const ref = new Date(today);
      ref.setMonth(ref.getMonth() - 1);
      setPeriodStart(ymd(startOfMonth(ref)));
      setPeriodEnd(ymd(endOfMonth(ref)));
    }
  }

  return (
    <form
      action={(formData) => {
        // Ensure label gets auto-generated if user left it blank
        if (!formData.get("label")) formData.set("label", autoLabel);
        return action(formData);
      }}
      className="flex flex-col gap-4"
      ref={formRef}
    >
      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="cleaner_filter">
          Cleaner
        </label>
        <select
          className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
          id="cleaner_filter"
          name="cleaner_filter"
          onChange={(e) => setCleanerId(e.target.value)}
          value={cleanerId}
        >
          <option value="">All cleaners</option>
          {cleaners.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Date range</label>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "thisWeek", label: "This week" },
            { key: "lastWeek", label: "Last week" },
            { key: "thisMonth", label: "This month" },
            { key: "lastMonth", label: "Last month" },
          ].map((preset) => (
            <button
              className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium transition hover:border-primary/40 hover:bg-primary/5"
              key={preset.key}
              onClick={() => applyPreset(preset.key as "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth")}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
            id="period_start"
            name="period_start"
            onChange={(e) => setPeriodStart(e.target.value)}
            required
            type="date"
            value={periodStart}
          />
          <input
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
            id="period_end"
            name="period_end"
            onChange={(e) => setPeriodEnd(e.target.value)}
            required
            type="date"
            value={periodEnd}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="label">
          Report label <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
          id="label"
          name="label"
          onChange={(e) => setLabel(e.target.value)}
          placeholder={autoLabel}
          type="text"
          value={label}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="notes">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
          id="notes"
          name="notes"
          rows={2}
        />
      </div>

      <div>
        <button
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-50"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Generating…" : "Generate report"}
        </button>
      </div>
    </form>
  );
}
