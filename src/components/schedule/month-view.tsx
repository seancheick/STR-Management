"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, Clock, Sparkles } from "lucide-react";

import type { AssignmentScheduleRecord } from "@/lib/queries/assignments";
import type { ReservationRecord } from "@/lib/queries/calendar";
import type { PropertyRecord } from "@/lib/queries/properties";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { isTightTurnover, tightTurnoverMinutes } from "@/lib/domain/assignments";
import { AssignmentDrawerSheet } from "@/components/assignments/assignment-drawer-sheet";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonthViewProps = {
  assignments: AssignmentScheduleRecord[];
  properties: PropertyRecord[];
  cleaners: TeamMemberRecord[];
  reservations: ReservationRecord[];
  monthDays: string[]; // ISO strings for every day in the month
  monthOffset: number;
  view: "week" | "month";
};

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CLEANER_PALETTE = [
  { bg: "bg-blue-100", ring: "ring-blue-300", text: "text-blue-900", dot: "bg-blue-500" },
  { bg: "bg-orange-100", ring: "ring-orange-300", text: "text-orange-900", dot: "bg-orange-500" },
  { bg: "bg-green-100", ring: "ring-green-300", text: "text-green-900", dot: "bg-green-500" },
  { bg: "bg-pink-100", ring: "ring-pink-300", text: "text-pink-900", dot: "bg-pink-500" },
  { bg: "bg-purple-100", ring: "ring-purple-300", text: "text-purple-900", dot: "bg-purple-500" },
  { bg: "bg-teal-100", ring: "ring-teal-300", text: "text-teal-900", dot: "bg-teal-500" },
  { bg: "bg-indigo-100", ring: "ring-indigo-300", text: "text-indigo-900", dot: "bg-indigo-500" },
];

const PROPERTY_DOT_PALETTE = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-fuchsia-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-lime-500",
];

const PLATFORM_STYLE: Record<
  ReservationRecord["platform"],
  { bar: string; label: string; dot: string }
> = {
  airbnb: { bar: "bg-rose-100/70 text-rose-900/90", label: "Airbnb", dot: "bg-rose-500" },
  vrbo: { bar: "bg-amber-100/70 text-amber-900/90", label: "VRBO", dot: "bg-amber-500" },
  booking: { bar: "bg-blue-100/70 text-blue-900/90", label: "Booking", dot: "bg-blue-500" },
  other: { bar: "bg-slate-100/70 text-slate-800/90", label: "Direct", dot: "bg-slate-500" },
};

const MAX_STRIPES_PER_WEEK = 3;
const MAX_PILLS_PER_CELL = 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashIndex(input: string, length: number): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h) % length;
}

function paletteFor(cleanerId: string | null): (typeof CLEANER_PALETTE)[number] {
  if (!cleanerId) {
    return {
      bg: "bg-amber-50",
      ring: "ring-amber-300",
      text: "text-amber-900",
      dot: "bg-amber-400",
    };
  }
  return CLEANER_PALETTE[hashIndex(cleanerId, CLEANER_PALETTE.length)];
}

function propertyDotFor(propertyId: string): string {
  return PROPERTY_DOT_PALETTE[hashIndex(propertyId, PROPERTY_DOT_PALETTE.length)];
}

function shortTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" ", "")
    .replace(":00", "");
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function atStartOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Priority within a day — lower number = top of list. */
function priorityRank(a: AssignmentScheduleRecord): number {
  if (a.status === "needs_reclean") return 0;
  if (isTightTurnover(a.checkout_at, a.due_at)) return 1;
  if (!a.cleaner_id) return 2;
  if (a.status === "in_progress") return 3;
  if (a.status === "assigned" || a.status === "acknowledged") return 4;
  if (a.status === "approved" || a.status === "completed") return 5;
  return 4;
}

function compactShort(name: string, max: number): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MonthView({
  assignments,
  properties,
  cleaners,
  reservations,
  monthDays,
  monthOffset,
  view,
}: MonthViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<"tight" | "unassigned" | "reclean" | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  const today = new Date();
  const monthStart = new Date(monthDays[0]);
  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Always render 6 week rows (42 cells) so the calendar height never jumps
  // between months with 4, 5, or 6 physical weeks.
  const weeks = useMemo(() => {
    const firstDow = monthStart.getDay();
    const leading: Date[] = [];
    for (let i = firstDow; i > 0; i--) {
      const d = new Date(monthStart);
      d.setDate(monthStart.getDate() - i);
      leading.push(d);
    }
    const monthDates = monthDays.map((iso) => new Date(iso));
    const lastDate = monthDates[monthDates.length - 1];
    const trailing: Date[] = [];
    // Pad to exactly 42 cells
    const needed = 42 - leading.length - monthDates.length;
    for (let i = 1; i <= needed; i++) {
      const d = new Date(lastDate);
      d.setDate(lastDate.getDate() + i);
      trailing.push(d);
    }
    const flat = [...leading, ...monthDates, ...trailing];
    const rows: Date[][] = [];
    for (let i = 0; i < flat.length; i += 7) rows.push(flat.slice(i, i + 7));
    return rows;
  }, [monthDays, monthStart]);

  const propertyNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of properties) m.set(p.id, p.name);
    return m;
  }, [properties]);

  // Group assignments by day of due_at, sort by priority.
  const byDay = useMemo(() => {
    const map = new Map<string, AssignmentScheduleRecord[]>();
    for (const a of assignments) {
      const key = dayKey(new Date(a.due_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const p = priorityRank(a) - priorityRank(b);
        if (p !== 0) return p;
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      });
    }
    return map;
  }, [assignments]);

  // Compute booking stripes per week row with overflow tracking.
  const stripesByWeek = useMemo(() => {
    type Stripe = {
      res: ReservationRecord;
      startCol: number;
      span: number;
      startsInWeek: boolean;
      endsInWeek: boolean;
    };
    const rows: Array<{ visible: Stripe[]; overflow: number }> = weeks.map(() => ({
      visible: [],
      overflow: 0,
    }));

    weeks.forEach((week, weekIdx) => {
      const weekStart = atStartOfDay(week[0]);
      const weekEndExclusive = new Date(week[6]);
      weekEndExclusive.setHours(24, 0, 0, 0);

      const all: Stripe[] = [];
      for (const res of reservations) {
        const start = atStartOfDay(new Date(res.start_at));
        const endInclusive = atStartOfDay(new Date(new Date(res.end_at).getTime() - 1));
        if (endInclusive < weekStart || start >= weekEndExclusive) continue;

        const clampedStart = start < weekStart ? weekStart : start;
        const clampedEnd = endInclusive >= weekEndExclusive ? new Date(week[6]) : endInclusive;

        const startCol = clampedStart.getDay();
        const endCol = clampedEnd.getDay();
        const span = Math.max(1, endCol - startCol + 1);

        all.push({
          res,
          startCol,
          span,
          startsInWeek: start >= weekStart,
          endsInWeek: endInclusive < weekEndExclusive,
        });
      }

      // Stable order: earlier start first, then longer spans
      all.sort(
        (a, b) =>
          a.res.start_at.localeCompare(b.res.start_at) || b.span - a.span,
      );

      rows[weekIdx].visible = all.slice(0, MAX_STRIPES_PER_WEEK);
      rows[weekIdx].overflow = Math.max(0, all.length - MAX_STRIPES_PER_WEEK);
    });

    return rows;
  }, [weeks, reservations]);

  // Today focus counts
  const todayCounts = useMemo(() => {
    const todayJobs = byDay.get(dayKey(today)) ?? [];
    const unassigned = todayJobs.filter((a) => !a.cleaner_id).length;
    const tight = todayJobs.filter((a) => isTightTurnover(a.checkout_at, a.due_at)).length;
    const reclean = todayJobs.filter((a) => a.status === "needs_reclean").length;
    return { total: todayJobs.length, unassigned, tight, reclean };
  }, [byDay, today]);

  const selectedAssignment = selectedId
    ? assignments.find((a) => a.id === selectedId) ?? null
    : null;

  const isEmpty = assignments.length === 0 && reservations.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header: month navigation + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            href={`?view=month&month=${monthOffset - 1}` as Route}
          >
            ←
          </Link>
          <span className="min-w-[160px] text-center text-sm font-semibold">{monthLabel}</span>
          <Link
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            href={`?view=month&month=${monthOffset + 1}` as Route}
          >
            →
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Link
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition ${
              view === "week"
                ? "bg-primary text-[#f7f5ef]"
                : "border border-border/70 bg-card text-foreground hover:bg-muted"
            }`}
            href="?week=0"
          >
            Week
          </Link>
          <Link
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition ${
              view === "month"
                ? "bg-primary text-[#f7f5ef]"
                : "border border-border/70 bg-card text-foreground hover:bg-muted"
            }`}
            href={`?view=month&month=${monthOffset}` as Route}
          >
            Month
          </Link>
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90"
            href="/dashboard/assignments/new"
          >
            + New job
          </Link>
        </div>
      </div>

      {/* What matters now — single sentence + clickable focus chips */}
      <TodayFocusStrip
        counts={todayCounts}
        highlight={highlight}
        onToggleHighlight={(h) => setHighlight((cur) => (cur === h ? null : h))}
      />

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-[1px] overflow-hidden rounded-t-2xl border border-border/60 bg-border/60">
        {WEEKDAY_LABELS.map((label) => (
          <div
            className="bg-card px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            key={label}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Month grid — 6 fixed week rows, each with stripe layer + day cells */}
      <div className="flex flex-col gap-[1px] overflow-hidden rounded-b-2xl border border-t-0 border-border/60 bg-border/60">
        {weeks.map((week, weekIdx) => (
          <WeekRow
            byDay={byDay}
            highlight={highlight}
            key={weekIdx}
            monthStart={monthStart}
            onSelect={setSelectedId}
            propertyNameById={propertyNameById}
            stripes={stripesByWeek[weekIdx]}
            today={today}
            week={week}
          />
        ))}
      </div>

      {/* Empty-state overlay when there's literally nothing in the month */}
      {isEmpty && <EmptyMonthCta />}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <span className="font-medium">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" /> Airbnb
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" /> Booking
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" /> VRBO
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" /> Tight turn / re-clean
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" /> Unassigned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" /> Approved
        </span>
      </div>

      {/* Slide-in edit sheet */}
      <AssignmentDrawerSheet
        assignment={selectedAssignment}
        cleaners={cleaners}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

// ─── Today Focus Strip ────────────────────────────────────────────────────────

function TodayFocusStrip({
  counts,
  highlight,
  onToggleHighlight,
}: {
  counts: { total: number; unassigned: number; tight: number; reclean: number };
  highlight: "tight" | "unassigned" | "reclean" | null;
  onToggleHighlight: (h: "tight" | "unassigned" | "reclean") => void;
}) {
  const { total, unassigned, tight, reclean } = counts;

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <span>No cleanings scheduled for today — a calm day on the schedule.</span>
      </div>
    );
  }

  const needsAttention = tight + reclean;
  const sentence =
    needsAttention > 0
      ? `${needsAttention} ${needsAttention === 1 ? "cleaning needs" : "cleanings need"} attention today${unassigned > 0 ? `, plus ${unassigned} still unassigned` : ""}.`
      : unassigned > 0
        ? `${total} ${total === 1 ? "cleaning" : "cleanings"} today — ${unassigned} still need${unassigned === 1 ? "s" : ""} a cleaner.`
        : `${total} ${total === 1 ? "cleaning" : "cleanings"} today, all assigned and on track.`;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Today
        </span>
        <span className="text-sm font-medium text-foreground">{sentence}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 items-center rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary">
          {total} {total === 1 ? "cleaning" : "cleanings"}
        </span>
        {unassigned > 0 && (
          <button
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
              highlight === "unassigned"
                ? "bg-amber-500 text-white"
                : "bg-amber-100 text-amber-900 hover:bg-amber-200"
            }`}
            onClick={() => onToggleHighlight("unassigned")}
            type="button"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            {unassigned} unassigned
          </button>
        )}
        {tight > 0 && (
          <button
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
              highlight === "tight"
                ? "bg-red-500 text-white"
                : "bg-red-100 text-red-900 hover:bg-red-200"
            }`}
            onClick={() => onToggleHighlight("tight")}
            type="button"
          >
            <Clock className="h-3 w-3" aria-hidden="true" />
            {tight} tight {tight === 1 ? "turn" : "turns"}
          </button>
        )}
        {reclean > 0 && (
          <button
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
              highlight === "reclean"
                ? "bg-red-500 text-white"
                : "bg-red-100 text-red-900 hover:bg-red-200"
            }`}
            onClick={() => onToggleHighlight("reclean")}
            type="button"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {reclean} re-clean
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Empty-month CTA ──────────────────────────────────────────────────────────

function EmptyMonthCta() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-card px-6 py-8 text-center">
      <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
      <h2 className="text-base font-semibold">No bookings or cleanings this month</h2>
      <p className="text-sm text-muted-foreground">
        Connect an Airbnb or VRBO calendar to auto-populate bookings, or schedule a cleaning manually.
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Link
          className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90"
          href="/dashboard/calendar"
        >
          Connect a calendar
        </Link>
        <Link
          className="inline-flex h-9 items-center rounded-full border border-border/70 bg-card px-4 text-sm font-medium transition hover:bg-muted"
          href="/dashboard/assignments/new"
        >
          + New cleaning
        </Link>
      </div>
    </div>
  );
}

// ─── Week row ─────────────────────────────────────────────────────────────────

function WeekRow({
  byDay,
  highlight,
  monthStart,
  onSelect,
  propertyNameById,
  stripes,
  today,
  week,
}: {
  byDay: Map<string, AssignmentScheduleRecord[]>;
  highlight: "tight" | "unassigned" | "reclean" | null;
  monthStart: Date;
  onSelect: (id: string) => void;
  propertyNameById: Map<string, string>;
  stripes: {
    visible: Array<{
      res: ReservationRecord;
      startCol: number;
      span: number;
      startsInWeek: boolean;
      endsInWeek: boolean;
    }>;
    overflow: number;
  };
  today: Date;
  week: Date[];
}) {
  const STRIPE_HEIGHT = 18;
  const STRIPE_GAP = 3;
  const stripeRows = stripes.visible.length + (stripes.overflow > 0 ? 1 : 0);
  const pillTopPad =
    stripeRows > 0 ? stripeRows * (STRIPE_HEIGHT + STRIPE_GAP) + 4 : 0;

  return (
    <div className="relative grid grid-cols-7 gap-[1px] bg-border/60">
      {/* Stripe layer */}
      {stripeRows > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 top-7 z-10 flex flex-col px-1"
          style={{ gap: `${STRIPE_GAP}px` }}
        >
          {stripes.visible.map((stripe, i) => {
            const style = PLATFORM_STYLE[stripe.res.platform];
            const propertyName =
              propertyNameById.get(stripe.res.property_id) ?? "Property";
            const propDot = propertyDotFor(stripe.res.property_id);
            return (
              <div className="grid grid-cols-7 gap-[1px]" key={`${stripe.res.id}-${i}`}>
                <div
                  className={`pointer-events-auto flex items-center gap-1.5 truncate px-2 text-[10px] font-semibold leading-none ${style.bar} ${
                    stripe.startsInWeek ? "rounded-l-full" : ""
                  } ${stripe.endsInWeek ? "rounded-r-full" : ""}`}
                  style={{
                    gridColumn: `${stripe.startCol + 1} / span ${stripe.span}`,
                    height: `${STRIPE_HEIGHT}px`,
                  }}
                  title={`${propertyName} · ${style.label}${
                    stripe.res.guest_name ? ` · ${stripe.res.guest_name}` : ""
                  }`}
                >
                  {stripe.startsInWeek && (
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${propDot}`} />
                  )}
                  <span className="truncate">
                    {stripe.startsInWeek ? propertyName : "…continued"}
                  </span>
                </div>
              </div>
            );
          })}
          {stripes.overflow > 0 && (
            <div className="grid grid-cols-7 gap-[1px]">
              <div
                className="col-span-7 truncate px-2 text-[10px] font-medium italic leading-none text-muted-foreground"
                style={{ height: `${STRIPE_HEIGHT}px`, lineHeight: `${STRIPE_HEIGHT}px` }}
              >
                + {stripes.overflow} more booking{stripes.overflow === 1 ? "" : "s"}…
              </div>
            </div>
          )}
        </div>
      )}

      {/* Day cells */}
      {week.map((cell, idx) => {
        const inMonth = cell.getMonth() === monthStart.getMonth();
        const isToday = sameLocalDay(cell, today);
        const dayJobs = byDay.get(dayKey(cell)) ?? [];

        // Apply highlight dimming if a focus chip is active
        const shouldDimCell =
          highlight !== null &&
          !dayJobs.some((a) =>
            highlight === "tight"
              ? isTightTurnover(a.checkout_at, a.due_at)
              : highlight === "reclean"
                ? a.status === "needs_reclean"
                : !a.cleaner_id,
          );

        return (
          <div
            className={`flex min-h-[128px] flex-col bg-card p-2 transition ${
              isToday ? "ring-2 ring-primary/50 ring-inset" : ""
            } ${shouldDimCell ? "opacity-40" : ""}`}
            key={idx}
          >
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center text-[11px] font-semibold tabular-nums ${
                  isToday
                    ? "rounded-full bg-primary px-1.5 text-[#f7f5ef]"
                    : inMonth
                      ? "text-foreground"
                      : "text-muted-foreground/40"
                }`}
              >
                {cell.getDate()}
              </span>
              {dayJobs.length > MAX_PILLS_PER_CELL && (
                <span className="text-[10px] font-medium text-muted-foreground">
                  {dayJobs.length}
                </span>
              )}
            </div>

            <div
              className="flex flex-col gap-1"
              style={pillTopPad ? { marginTop: `${pillTopPad}px` } : undefined}
            >
              {dayJobs.slice(0, MAX_PILLS_PER_CELL).map((a) => (
                <CalendarPill
                  assignment={a}
                  dimmed={
                    highlight !== null &&
                    (highlight === "tight"
                      ? !isTightTurnover(a.checkout_at, a.due_at)
                      : highlight === "reclean"
                        ? a.status !== "needs_reclean"
                        : a.cleaner_id !== null)
                  }
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  propertyName={propertyNameById.get(a.property_id)}
                />
              ))}
              {dayJobs.length > MAX_PILLS_PER_CELL && (
                <button
                  className="text-left text-[10px] font-semibold text-primary hover:underline"
                  onClick={() => onSelect(dayJobs[MAX_PILLS_PER_CELL].id)}
                  type="button"
                >
                  + {dayJobs.length - MAX_PILLS_PER_CELL} more…
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Pill inside a day cell ───────────────────────────────────────────────────

function CalendarPill({
  assignment,
  dimmed,
  onClick,
  propertyName,
}: {
  assignment: AssignmentScheduleRecord;
  dimmed: boolean;
  onClick: () => void;
  propertyName: string | undefined;
}) {
  const tight = isTightTurnover(assignment.checkout_at, assignment.due_at);
  const gap = tightTurnoverMinutes(assignment.checkout_at, assignment.due_at);
  const needsReclean = assignment.status === "needs_reclean";
  const approved = assignment.status === "approved" || assignment.status === "completed";
  const cleanerFirst = assignment.cleaners?.full_name?.split(" ")[0] ?? null;

  let paletteClass: string;
  let icon: React.ReactNode = <Sparkles className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />;
  let personLabel: string;

  if (needsReclean) {
    paletteClass = "bg-red-50 ring-red-300 text-red-900";
    icon = <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />;
    personLabel = "Re-clean";
  } else if (tight) {
    paletteClass = "bg-red-50 ring-red-300 text-red-900";
    icon = <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />;
    personLabel = cleanerFirst ?? "Unassigned";
  } else if (approved) {
    paletteClass = "bg-green-50 ring-green-300 text-green-900";
    personLabel = cleanerFirst ?? "Ready";
  } else if (!assignment.cleaner_id) {
    paletteClass = "bg-amber-50 ring-amber-300 text-amber-900";
    personLabel = "Assign";
  } else {
    const p = paletteFor(assignment.cleaner_id);
    paletteClass = `${p.bg} ${p.ring} ${p.text}`;
    personLabel = cleanerFirst ?? "Assigned";
  }

  const time = shortTime(assignment.due_at);
  const propDot = propertyDotFor(assignment.property_id);
  const shortProp = propertyName ? compactShort(propertyName, 14) : "";
  const gapHours = gap !== null ? Math.floor(gap / 60) : null;
  const urgencyLabel = tight && gap !== null
    ? gap < 60
      ? `${gap}m`
      : `${gapHours}h`
    : null;

  return (
    <button
      className={`flex w-full flex-col gap-0.5 truncate rounded-md px-1.5 py-1 text-left text-[10px] font-semibold leading-tight ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${paletteClass} ${
        dimmed ? "opacity-40" : ""
      }`}
      onClick={onClick}
      title={`${propertyName ?? "Property"} · ${personLabel} · ${time}${
        tight && gap !== null ? ` · tight (${gap}m)` : ""
      }`}
      type="button"
    >
      <span className="flex items-center gap-1 truncate">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${propDot}`} aria-hidden="true" />
        {icon}
        <span className="truncate tabular-nums">{time}</span>
        <span className="truncate opacity-90">· {personLabel}</span>
        {urgencyLabel && (
          <span className="ml-auto shrink-0 rounded-full bg-red-200 px-1 text-[9px] font-bold leading-none text-red-900">
            {urgencyLabel}
          </span>
        )}
      </span>
      {shortProp && (
        <span className="truncate pl-3 text-[9px] font-medium uppercase tracking-wide opacity-70">
          {shortProp}
        </span>
      )}
    </button>
  );
}
