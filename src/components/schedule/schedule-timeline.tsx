"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Clock, Lock, MessageSquareText, Sparkles } from "lucide-react";

import type { AssignmentScheduleRecord } from "@/lib/queries/assignments";
import type { ReservationRecord } from "@/lib/queries/calendar";
import type { PropertyRecord } from "@/lib/queries/properties";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { isTightTurnover } from "@/lib/domain/assignments";
import { AssignmentDrawerSheet } from "@/components/assignments/assignment-drawer-sheet";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleTimelineProps = {
  assignments: AssignmentScheduleRecord[];
  properties: PropertyRecord[];
  reservations: ReservationRecord[];
  cleaners: TeamMemberRecord[];
  days: string[]; // ISO of each visible day (local midnight)
  weekOffset: number;
  selectedPropertyId: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_STYLE: Record<
  ReservationRecord["platform"],
  { barBg: string; dot: string; label: string }
> = {
  airbnb: { barBg: "bg-rose-500", dot: "bg-white/90", label: "Airbnb" },
  booking: { barBg: "bg-blue-600", dot: "bg-white/90", label: "Booking.com" },
  vrbo: { barBg: "bg-amber-500", dot: "bg-white/90", label: "VRBO" },
  other: { barBg: "bg-slate-500", dot: "bg-white/90", label: "Direct" },
};

const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function atStartOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKeyUTC(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localDateKey(iso: string): string {
  return dayKeyUTC(new Date(iso));
}

/** Column index (0..days.length-1) a date falls on, or null if outside the window. */
function dayIndex(date: Date, windowStart: Date, windowLength: number): number | null {
  const ms = atStartOfDay(date).getTime() - windowStart.getTime();
  const idx = Math.round(ms / (24 * 60 * 60 * 1000));
  if (idx < 0 || idx >= windowLength) return null;
  return idx;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleTimeline({
  assignments,
  properties,
  reservations,
  cleaners,
  days,
  weekOffset,
  selectedPropertyId,
}: ScheduleTimelineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  const today = new Date();
  const dayDates = useMemo(() => days.map((iso) => new Date(iso)), [days]);
  const windowStart = useMemo(() => atStartOfDay(dayDates[0]), [dayDates]);

  const visibleProperties = useMemo(() => {
    const filtered = selectedPropertyId
      ? properties.filter((p) => p.id === selectedPropertyId)
      : properties;
    return filtered.filter((p) => p.active);
  }, [properties, selectedPropertyId]);

  const rangeLabel = useMemo(() => {
    const first = dayDates[0];
    const last = dayDates[dayDates.length - 1];
    const sameMonth = first.getMonth() === last.getMonth();
    const firstLabel = first.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const lastLabel = last.toLocaleDateString("en-US", {
      month: sameMonth ? undefined : "short",
      day: "numeric",
      year: "numeric",
    });
    return `${firstLabel} – ${lastLabel}`;
  }, [dayDates]);

  const selectedAssignment = selectedId
    ? assignments.find((a) => a.id === selectedId) ?? null
    : null;

  const isEmpty = reservations.length === 0 && assignments.length === 0;

  // Reservations grouped by property, clipped to window, with column positions.
  type ClippedReservation = {
    res: ReservationRecord;
    startCol: number;
    endCol: number;
    startsInWindow: boolean;
    endsInWindow: boolean;
  };

  const reservationsByProperty = useMemo(() => {
    const map = new Map<string, ClippedReservation[]>();
    for (const res of reservations) {
      const start = atStartOfDay(new Date(res.start_at));
      const endInclusive = atStartOfDay(new Date(new Date(res.end_at).getTime() - 1));
      if (endInclusive < windowStart) continue;
      const windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + days.length - 1);
      if (start > windowEnd) continue;

      const clampedStart = start < windowStart ? windowStart : start;
      const clampedEnd = endInclusive > windowEnd ? windowEnd : endInclusive;
      const startCol = dayIndex(clampedStart, windowStart, days.length) ?? 0;
      const endCol =
        dayIndex(clampedEnd, windowStart, days.length) ?? days.length - 1;

      if (!map.has(res.property_id)) map.set(res.property_id, []);
      map.get(res.property_id)!.push({
        res,
        startCol,
        endCol,
        startsInWindow: start >= windowStart,
        endsInWindow: endInclusive <= windowEnd,
      });
    }
    // Sort each property's reservations chronologically
    for (const list of map.values()) {
      list.sort((a, b) => a.res.start_at.localeCompare(b.res.start_at));
    }
    return map;
  }, [reservations, windowStart, days.length]);

  // Assignments grouped by property, each keyed to a day column.
  const assignmentsByPropertyDay = useMemo(() => {
    const map = new Map<string, Map<number, AssignmentScheduleRecord[]>>();
    for (const a of assignments) {
      const anchor = a.checkout_at ?? a.due_at;
      const col = dayIndex(new Date(anchor), windowStart, days.length);
      if (col === null) continue;
      if (!map.has(a.property_id)) map.set(a.property_id, new Map());
      const perDay = map.get(a.property_id)!;
      if (!perDay.has(col)) perDay.set(col, []);
      perDay.get(col)!.push(a);
    }
    return map;
  }, [assignments, windowStart, days.length]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header: range nav + range label + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            aria-label="Previous 2 weeks"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            href={`?view=week&week=${weekOffset - 2}` as Route}
          >
            ←
          </Link>
          <span className="min-w-[180px] text-center text-sm font-semibold">
            {rangeLabel}
          </span>
          <Link
            aria-label="Next 2 weeks"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            href={`?view=week&week=${weekOffset + 2}` as Route}
          >
            →
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <Legend color="bg-rose-500" label="Airbnb" />
          <Legend color="bg-blue-600" label="Booking" />
          <Legend color="bg-amber-500" label="VRBO" />
          <Legend color="border border-green-300 bg-green-50" label="Clean" />
        </div>
      </div>

      {/* Timeline — grid with property column + N day columns.
          Scroll horizontally when narrow; rows wrap in a card. */}
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
        <div
          className="grid min-w-[1000px]"
          style={{
            gridTemplateColumns: `220px repeat(${days.length}, minmax(80px, 1fr))`,
          }}
        >
          {/* Header row: blank property cell + day labels */}
          <div className="sticky left-0 z-20 flex items-end border-b border-r border-border/60 bg-card px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Property
            </span>
          </div>
          {dayDates.map((d, i) => {
            const isToday = sameLocalDay(d, today);
            return (
              <div
                className={`border-b border-r border-border/50 px-2 py-2 text-center last:border-r-0 ${
                  isToday ? "bg-primary/5" : ""
                }`}
                key={i}
              >
                <div
                  className={`text-[10px] font-semibold uppercase tracking-wider ${
                    isToday ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {DAY_LETTER[d.getDay()]}
                </div>
                <div
                  className={`mt-0.5 text-sm tabular-nums ${
                    isToday
                      ? "font-bold text-primary"
                      : "font-semibold text-foreground"
                  }`}
                >
                  {isToday ? (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[#f7f5ef]">
                      {d.getDate()}
                    </span>
                  ) : (
                    d.getDate()
                  )}
                </div>
              </div>
            );
          })}

          {/* Property rows */}
          {visibleProperties.length === 0 ? (
            <div
              className="col-span-full px-6 py-10 text-center text-sm text-muted-foreground"
              style={{ gridColumn: `1 / -1` }}
            >
              No active properties to show.
            </div>
          ) : (
            visibleProperties.map((property) => {
              const propRes = reservationsByProperty.get(property.id) ?? [];
              const propAssignments =
                assignmentsByPropertyDay.get(property.id) ?? new Map();

              return (
                <PropertyRow
                  assignmentsByDay={propAssignments}
                  dayDates={dayDates}
                  key={property.id}
                  onSelectAssignment={setSelectedId}
                  property={property}
                  reservations={propRes}
                  today={today}
                />
              );
            })
          )}
        </div>
      </div>

      {isEmpty && visibleProperties.length > 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card px-6 py-8 text-center">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <p className="text-sm font-medium">Nothing scheduled in this window.</p>
          <p className="text-xs text-muted-foreground">
            Connect a calendar or add a cleaning to fill it in.
          </p>
        </div>
      )}

      <AssignmentDrawerSheet
        assignment={selectedAssignment}
        cleaners={cleaners}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

// ─── Property row ─────────────────────────────────────────────────────────────

function PropertyRow({
  assignmentsByDay,
  dayDates,
  onSelectAssignment,
  property,
  reservations,
  today,
}: {
  assignmentsByDay: Map<number, AssignmentScheduleRecord[]>;
  dayDates: Date[];
  onSelectAssignment: (id: string) => void;
  property: PropertyRecord;
  reservations: Array<{
    res: ReservationRecord;
    startCol: number;
    endCol: number;
    startsInWindow: boolean;
    endsInWindow: boolean;
  }>;
  today: Date;
}) {
  const unitLabel = [
    property.bedrooms ? `${property.bedrooms} BR` : null,
    property.timezone ? property.timezone.replace("America/New_York", "ET").replace("America/Chicago", "CT").replace("America/Denver", "MT").replace("America/Los_Angeles", "PT") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* Property label cell (sticky on left) */}
      <div className="sticky left-0 z-10 flex min-h-[72px] flex-col justify-center border-b border-r border-border/50 bg-card px-4 py-3">
        <Link
          className="text-sm font-semibold leading-tight hover:underline"
          href={`/dashboard/properties/${property.id}` as Route}
        >
          {property.name}
        </Link>
        {unitLabel && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{unitLabel}</p>
        )}
      </div>

      {/* Day cells — background + today highlight only. Overlays render on top. */}
      <div
        className="relative col-span-full grid min-h-[72px] border-b border-border/50"
        style={{
          gridColumn: `2 / -1`,
          gridTemplateColumns: `repeat(${dayDates.length}, minmax(80px, 1fr))`,
        }}
      >
        {/* Background day cells (today tint + vertical separators) */}
        {dayDates.map((d, i) => {
          const isToday = sameLocalDay(d, today);
          return (
            <div
              className={`border-r border-border/30 last:border-r-0 ${
                isToday ? "bg-primary/5" : ""
              }`}
              key={i}
              aria-hidden="true"
            />
          );
        })}

        {/* Reservation bars + cleaning chips layered inside */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-1 px-1.5 py-2">
          {/* Top lane: reservation bars */}
          <div
            className="pointer-events-auto grid gap-0"
            style={{
              gridTemplateColumns: `repeat(${dayDates.length}, minmax(0, 1fr))`,
            }}
          >
            {reservations.map((clip, i) => {
              const blocked =
                clip.res.summary?.toLowerCase().includes("not available") ||
                clip.res.summary?.toLowerCase().includes("blocked");
              const style = PLATFORM_STYLE[clip.res.platform];
              return blocked ? (
                <div
                  className="flex items-center justify-center truncate rounded-full border border-dashed border-muted-foreground/40 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.08)_6px,rgba(0,0,0,0.08)_12px)] px-3 text-[11px] font-semibold text-muted-foreground"
                  key={`res-${clip.res.id}-${i}`}
                  style={{
                    gridColumn: `${clip.startCol + 1} / span ${clip.endCol - clip.startCol + 1}`,
                    minHeight: "28px",
                  }}
                  title={clip.res.summary ?? "Blocked"}
                >
                  <Lock className="mr-1.5 h-3 w-3" aria-hidden="true" />
                  Blocked
                </div>
              ) : (
                <button
                  className={`flex items-center gap-1.5 truncate px-3 text-[11px] font-semibold text-white transition hover:opacity-90 ${style.barBg} ${
                    clip.startsInWindow ? "rounded-l-full" : ""
                  } ${clip.endsInWindow ? "rounded-r-full" : ""}`}
                  key={`res-${clip.res.id}-${i}`}
                  style={{
                    gridColumn: `${clip.startCol + 1} / span ${clip.endCol - clip.startCol + 1}`,
                    minHeight: "28px",
                  }}
                  title={`${style.label}${clip.res.guest_name ? ` · ${clip.res.guest_name}` : ""}`}
                  type="button"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                  <span className="truncate">
                    {clip.startsInWindow
                      ? `#${clip.res.id.slice(0, 3)} ${style.label}`
                      : `…${style.label}`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bottom lane: cleaning chips + tight badges on specific days */}
          <div
            className="pointer-events-auto grid gap-0"
            style={{
              gridTemplateColumns: `repeat(${dayDates.length}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: dayDates.length }, (_, col) => {
              const dayAssignments = assignmentsByDay.get(col) ?? [];
              if (dayAssignments.length === 0) return <div key={col} />;
              return (
                <div
                  className="flex min-w-0 items-center justify-center px-1"
                  key={col}
                  style={{ gridColumn: `${col + 1} / span 1` }}
                >
                  <CleaningChip
                    assignment={dayAssignments[0]}
                    onClick={() => onSelectAssignment(dayAssignments[0].id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Cleaning chip ────────────────────────────────────────────────────────────

function CleaningChip({
  assignment,
  onClick,
}: {
  assignment: AssignmentScheduleRecord;
  onClick: () => void;
}) {
  const needsReclean = assignment.status === "needs_reclean";
  const tight = isTightTurnover(assignment.checkout_at, assignment.next_checkin_at);
  const cleanerFirst = assignment.cleaners?.full_name?.split(" ")[0] ?? null;

  // Palette: green for assigned/approved, amber for unassigned, red for tight/reclean
  let style = "border-green-300 bg-green-50 text-green-700";
  let label: string;

  if (needsReclean) {
    style = "border-red-300 bg-red-50 text-red-700";
    label = "Re-clean";
  } else if (tight) {
    style = "border-red-300 bg-red-50 text-red-700";
    label = `Tight · ${cleanerFirst ?? "?"}`;
  } else if (assignment.status === "approved" || assignment.status === "completed") {
    style = "border-green-300 bg-green-50 text-green-700";
    label = `Clean · ${cleanerFirst ?? "✓"}`;
  } else if (!assignment.cleaner_id) {
    style = "border-amber-300 bg-amber-50 text-amber-700";
    label = "Assign →";
  } else {
    label = `Clean · ${cleanerFirst ?? "—"}`;
  }

  return (
    <button
      className={`inline-flex min-w-0 items-center gap-1 truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold transition hover:shadow-sm ${style}`}
      onClick={onClick}
      title={`${label}${assignment.source_type === "ical" ? " · iCal" : " · Manual"}`}
      type="button"
    >
      {tight ? (
        <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : (
        <MessageSquareText className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
