"use client";

import { JOBS_CHANGED_EVENT } from "@/lib/services/job-updates";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Calendar, Lock, Sparkles } from "lucide-react";

import type { AssignmentScheduleRecord } from "@/lib/queries/assignments";
import type { ReservationRecord } from "@/lib/queries/calendar";
import type { PropertyRecord } from "@/lib/queries/properties";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { calendarRefreshRows, calendarWindowChunks, calendarWindowContains, calendarAdjacentDays, calendarScrollAnchor, calendarDate, calendarDayKey, calendarEdgeDirection, calendarListingId, calendarInstantKey, calendarRangeLabel, reservationColumns } from "@/lib/services/calendar-display";
import { formatInTimeZone } from "@/lib/ical/timezone";
import { CleaningCalendarEvent } from "./cleaning-calendar-event";
import { AssignmentDrawerSheet } from "@/components/assignments/assignment-drawer-sheet";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleTimelineProps = {
  todayKey: string;
  assignments: AssignmentScheduleRecord[];
  properties: PropertyRecord[];
  reservations: ReservationRecord[];
  cleaners: TeamMemberRecord[];
  days: string[]; // ISO of each visible day (local midnight)
  weekOffset: number;
  /** "&cleaner=…&property=…" — active filters to keep when paging. */
  filterQuery?: string;
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
  hostex: { barBg: "bg-primary", dot: "bg-primary-foreground", label: "Hostex" },
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

/** Column index (0..days.length-1) a date falls on, or null if outside the window.
 *  Uses Math.floor on local-day math; DST transitions produce 23h or 25h days,
 *  so Math.round would land on the wrong column. */
function dayIndex(date: Date, windowStart: Date, windowLength: number): number | null {
  const ms = atStartOfDay(date).getTime() - windowStart.getTime();
  if (ms < 0) return null;
  // 22h catches 23h DST-spring days correctly; 26h catches 25h DST-fall days.
  const idx = Math.floor((ms + 2 * 3_600_000) / 86_400_000);
  if (idx < 0 || idx >= windowLength) return null;
  return idx;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleTimeline({
  todayKey,
  assignments: initialAssignments,
  properties,
  reservations: initialReservations,
  cleaners,
  days: initialDays,
  filterQuery = "",
  selectedPropertyId,
}: ScheduleTimelineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [days, setDays] = useState(initialDays);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [reservations, setReservations] = useState(initialReservations);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const daysRef = useRef(days);
  const scrollAnchor = useRef<number | null>(null);
  useLayoutEffect(() => {
    daysRef.current = days;
    if (scrollAnchor.current !== null && scrollerRef.current) {
      scrollerRef.current.scrollLeft = scrollAnchor.current;
      scrollAnchor.current = null;
    }
  }, [days]);

  const extendDays = useCallback(async (direction: "previous" | "next") => {
    if (loadingRef.current) return false;
    loadingRef.current = true;
    setLoading(true);
    setLoadError(null);
    const extra = calendarAdjacentDays(daysRef.current, direction);
    try {
      const response = await fetch(`/api/schedule/range?start=${extra[0]}&end=${extra[extra.length - 1]}${filterQuery}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load more dates. Scroll again to retry.");
      const data = await response.json() as { assignments: AssignmentScheduleRecord[]; reservations: ReservationRecord[] };
      scrollAnchor.current = calendarScrollAnchor(scrollerRef.current?.scrollLeft ?? 0, direction === "previous" ? extra.length : 0);
      const merge = <T extends { id: string }>(current: T[], incoming: T[]) => Array.from(new Map([...current, ...incoming].map((row) => [row.id, row])).values());
      setAssignments((current) => merge(current, data.assignments));
      setReservations((current) => merge(current, data.reservations));
      const expanded = direction === "previous" ? [...extra, ...daysRef.current] : [...daysRef.current, ...extra];
      daysRef.current = expanded;
      setDays(expanded);
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load more dates.");
      return false;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [filterQuery]);

  // Each server refresh reconciles the loaded viewport. A cancelled request
  // must never mark incoming props as already applied and skip its replacement.
  useEffect(() => {
    const start = daysRef.current[0];
    const end = daysRef.current[daysRef.current.length - 1];
    const controller = new AbortController();
    let refreshVersion = 0;
    async function refreshLoadedWindow() {
      const version = ++refreshVersion;
      try {
        const freshAssignments: AssignmentScheduleRecord[] = [];
        const freshReservations: ReservationRecord[] = [];
        for (const chunk of calendarWindowChunks(start, end)) {
          const response = await fetch(`/api/schedule/range?start=${chunk.start}&end=${chunk.end}${filterQuery}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("Could not refresh the calendar. Reload to retry.");
          const data = await response.json() as { assignments: AssignmentScheduleRecord[]; reservations: ReservationRecord[] };
          freshAssignments.push(...data.assignments);
          freshReservations.push(...data.reservations);
        }
        if (controller.signal.aborted || version !== refreshVersion) return;
        const timezone = (row: { property_id: string; listing_property_id?: string | null }) => properties.find((p) => p.id === calendarListingId(row))?.timezone;
        setAssignments((current) => calendarRefreshRows(current, freshAssignments, (row) => calendarWindowContains(row.checkout_at ?? row.due_at, start, end, timezone(row))));
        setReservations((current) => calendarRefreshRows(current, freshReservations, (row) => calendarInstantKey(row.start_at, timezone(row)) <= end && calendarInstantKey(row.end_at, timezone(row)) >= start));
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Could not refresh the calendar.");
      }
    }
    const refresh = () => { void refreshLoadedWindow(); };
    refresh();
    window.addEventListener(JOBS_CHANGED_EVENT, refresh);
    return () => { controller.abort(); window.removeEventListener(JOBS_CHANGED_EVENT, refresh); };
  }, [initialAssignments, initialReservations, filterQuery, properties]);

  const scrollWeeks = useCallback(async (direction: "previous" | "next") => {
    const el = scrollerRef.current;
    if (!el) return;
    let target = el.scrollLeft + (direction === "next" ? 1960 : -1960);
    if (target < 0 || target > el.scrollWidth - el.clientWidth) {
      if (!await extendDays(direction)) return;
      if (direction === "previous") target += 1960;
      requestAnimationFrame(() => el.scrollTo({ left: Math.max(0, target), behavior: "smooth" }));
    } else el.scrollTo({ left: target, behavior: "smooth" });
  }, [extendDays]);

  const scrollToToday = useCallback(async () => {
    const todayKey = calendarInstantKey(new Date().toISOString());
    while (!daysRef.current.includes(todayKey)) {
      if (!await extendDays(todayKey < daysRef.current[0] ? "previous" : "next")) return;
    }
    requestAnimationFrame(() => scrollerRef.current?.scrollTo({ left: Math.max(0, (daysRef.current.indexOf(todayKey) - 2) * 140), behavior: "smooth" }));
  }, [extendDays]);

  useEffect(() => {
    if (!selectedId) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  // Keyboard nav: ←/→ jump ±2 weeks, Home = today, End = +8 weeks.
  // Only fires when no text input has focus so typing doesn't hijack it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && target.closest("input, textarea, select, button, a, [contenteditable], [role=dialog]")) return;
      // Ignore modifier combos (user may be copying etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowLeft") { e.preventDefault(); void scrollWeeks("previous"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); void scrollWeeks("next"); }
      else if (e.key === "Home") { e.preventDefault(); void scrollToToday(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scrollWeeks, scrollToToday]);

  // Pointer-drag-to-scroll for desktop mice / trackpads. Native touch-pan
  // already works on mobile.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    let isDown = false;
    let lastX = 0;

    function onDown(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      // Don't hijack drags starting on interactive elements (buttons, links)
      const target = e.target as HTMLElement;
      if (target.closest("button,a,input,select")) return;
      isDown = true;
      lastX = e.clientX;
      el!.setPointerCapture(e.pointerId);
      el!.style.cursor = "grabbing";
    }
    function onMove(e: PointerEvent) {
      if (!isDown) return;
      // Incremental movement survives prepending columns during a drag.
      el!.scrollLeft += lastX - e.clientX;
      lastX = e.clientX;
    }
    function onUp(e: PointerEvent) {
      isDown = false;
      if (el!.hasPointerCapture(e.pointerId)) el!.releasePointerCapture(e.pointerId);
      el!.style.cursor = "";
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Auto-scroll to today's column on first paint so hosts don't have to hunt
  // for it when the window opens on past/future days.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !initialDays.length) return;
    const todayCol = dayIndex(new Date(), calendarDate(initialDays[0]), initialDays.length);
    if (todayCol === null || todayCol < 3) return;
    // Each day ≈ (el.scrollWidth - propertyCol) / initialDays.length
    const propertyColPx = 220;
    const perDay = (el.scrollWidth - propertyColPx) / initialDays.length;
    el.scrollLeft = Math.max(0, perDay * (todayCol - 2));
  }, [initialDays]);

  // Continuous paging only follows user gestures, never initial/programmatic scrolling.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let frame = 0;
    let pointerX: number | null = null;
    let gestureDelta = 0;
    function checkEdge() {
      if (loadingRef.current) return;
      const direction = calendarEdgeDirection(el!.scrollLeft, el!.scrollWidth, el!.clientWidth, gestureDelta);
      if (!direction) return;
      void extendDays(direction);
    }
    function scheduleCheck(delta: number) {
      if (!delta) return;
      gestureDelta = delta;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(checkEdge);
    }
    function onWheel(e: WheelEvent) {
      scheduleCheck(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0);
    }
    function onPointerDown(e: PointerEvent) {
      if ((e.target as HTMLElement).closest("button,a,input,select")) return;
      pointerX = e.clientX;
    }
    function onPointerMove(e: PointerEvent) {
      if (pointerX === null) return;
      const delta = pointerX - e.clientX;
      pointerX = e.clientX;
      scheduleCheck(delta);
    }
    function onPointerUp() { pointerX = null; }
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [extendDays]);

  const today = calendarDate(todayKey);
  const dayDates = useMemo(() => days.map(calendarDate), [days]);

  const visibleProperties = useMemo(() => {
    const filtered = selectedPropertyId
      ? properties.filter((p) => p.id === selectedPropertyId)
      : properties;
    return filtered.filter((p) => p.active);
  }, [properties, selectedPropertyId]);

  const rangeLabel = calendarRangeLabel(dayDates[0], dayDates[dayDates.length - 1]);
  const timezoneByProperty = useMemo(() => new Map(properties.map((p) => [p.id, p.timezone])), [properties]);
  const dayKeys = useMemo(() => dayDates.map(calendarDayKey), [dayDates]);

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
      const clip = reservationColumns(res.start_at, res.end_at, dayKeys, timezoneByProperty.get(calendarListingId(res)));
      if (!clip) continue;
      if (!map.has(calendarListingId(res))) map.set(calendarListingId(res), []);
      map.get(calendarListingId(res))!.push({
        res,
        ...clip,
      });
    }
    // Sort each property's reservations chronologically
    for (const list of map.values()) {
      list.sort((a, b) => a.res.start_at.localeCompare(b.res.start_at));
    }
    return map;
  }, [reservations, dayKeys, timezoneByProperty]);

  // Assignments grouped by property, each keyed to a day column.
  const assignmentsByPropertyDay = useMemo(() => {
    const map = new Map<string, Map<number, AssignmentScheduleRecord[]>>();
    for (const a of assignments) {
      const anchor = a.checkout_at ?? a.due_at;
      const col = dayKeys.indexOf(calendarInstantKey(anchor, timezoneByProperty.get(calendarListingId(a))));
      if (col < 0) continue;
      if (!map.has(calendarListingId(a))) map.set(calendarListingId(a), new Map());
      const perDay = map.get(calendarListingId(a))!;
      if (!perDay.has(col)) perDay.set(col, []);
      perDay.get(col)!.push(a);
    }
    return map;
  }, [assignments, dayKeys, timezoneByProperty]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Header: range nav + range label + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Previous 2 weeks"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            onClick={() => void scrollWeeks("previous")}
          >
            ←
          </button>
          <span className="min-w-0 text-center sm:min-w-[180px] text-sm font-semibold">
            {rangeLabel}
          </span>
          <button
            type="button"
            aria-label="Next 2 weeks"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            onClick={() => void scrollWeeks("next")}
          >
            →
          </button>
          <button
            className="ml-1 inline-flex h-11 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-xs font-medium transition hover:bg-muted"
            onClick={scrollToToday}
            type="button"
          >
            <Calendar className="h-3 w-3" aria-hidden="true" />
            Today
          </button>
          <a className="inline-flex h-11 items-center rounded-full border border-border/70 bg-card px-3 text-xs font-medium hover:bg-muted" download
            href={`/api/schedule/export.csv?start=${days[0]}&end=${days[days.length - 1]}${filterQuery}`}
            title="Download all loaded dates as CSV">⬇ CSV</a>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <Legend color="bg-rose-500" label="Airbnb" />
          <Legend color="bg-blue-600" label="Booking" />
          <Legend color="bg-amber-500" label="VRBO" />
          <Legend color="border border-green-300 bg-green-50" label="Clean" />
        </div>
      </div>

      {loading && <p role="status" className="text-xs text-muted-foreground">Loading more dates…</p>}
      {loadError && <p role="alert" className="text-xs text-destructive">{loadError}</p>}
      <p className="text-xs text-muted-foreground">Scroll sideways to browse dates. At either edge, keep scrolling to load earlier or later weeks.</p>

      {/* Timeline — grid with property column + N day columns.
          Horizontal scroll enabled: trackpad / touch pan, mouse wheel shift,
          and pointer-drag. Each day column is wide enough that a 14-day
          window always requires scrolling on laptop viewports (2-week wide:
          220 + 14 * 140 = 2180px minimum). */}
      <div
        className="cursor-grab select-none overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm"
        ref={scrollerRef}
        style={{ scrollSnapType: "none", overscrollBehaviorX: "contain" }}
      >
        <div
          className="grid"
          style={{
            width: `${220 + days.length * 140}px`,
            gridTemplateColumns: `220px repeat(${days.length}, 140px)`,
          }}
        >
          {/* Header row: blank property cell + day labels.
              Sticky to the top of the viewport so long portfolios don't lose
              the day labels as the user scrolls down. The corner cell is
              sticky in both directions with higher z-index. */}
          <div className="sticky left-0 top-0 z-30 flex items-end border-b border-r border-border/60 bg-card px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Property
            </span>
          </div>
          {dayDates.map((d, i) => {
            const isToday = sameLocalDay(d, today);
            return (
              <div
                className={`sticky top-0 z-20 border-b border-r border-border/50 bg-card px-2 py-2 text-center last:border-r-0 ${
                  isToday ? "bg-primary/5" : ""
                }`}
                key={days[i]}
                data-calendar-day={days[i]}
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
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
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
              style={{ gridColumn: i + 1, gridRow: 1 }}
              className={`border-r border-border/30 last:border-r-0 ${
                isToday ? "bg-primary/5" : ""
              }`}
              key={i}
              aria-hidden="true"
            />
          );
        })}

        {/* Reservation bars + cleaning chips layered inside */}
        <div className="pointer-events-none relative col-span-full row-start-1 flex flex-col justify-center gap-1 px-1.5 py-2">
          {/* Top lane: reservation bars */}
          <div
            className="pointer-events-auto grid gap-y-1"
            style={{
              gridTemplateColumns: `repeat(${dayDates.length}, minmax(0, 1fr))`,
            }}
          >
            {reservations.map((clip, i) => {
              const blocked =
                clip.res.summary?.toLowerCase().includes("not available") ||
                clip.res.summary?.toLowerCase().includes("blocked");
              const platformStyle = PLATFORM_STYLE[clip.res.platform];
              const style = clip.res.historical ? { ...platformStyle, barBg: "bg-slate-400", label: `${platformStyle.label} · Historical` } : platformStyle;
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
                <BookingBar
                  clip={clip}
                  key={`res-${clip.res.id}-${i}`}
                  style={style}
                  timezone={property.timezone}
                />
              );
            })}
          </div>

          {/* Bottom lane: cleaning chips + tight badges on specific days */}
          <div
            className="pointer-events-auto grid gap-y-1"
            style={{
              gridTemplateColumns: `repeat(${dayDates.length}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: dayDates.length }, (_, col) => {
              const dayAssignments = assignmentsByDay.get(col) ?? [];
              if (dayAssignments.length === 0) return <div key={col} />;
              return (
                <div
                  className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-1"
                  key={col}
                  style={{ gridColumn: `${col + 1} / span 1` }}
                >
                  {/* Every job that day (e.g. a re-clean plus a turnover), not just the first */}
                  {dayAssignments.map((a) => (
                    <CleaningCalendarEvent
                      assignment={a}
                      key={a.id}
                      onClick={() => onSelectAssignment(a.id)}
                    />
                  ))}
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


function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

// ─── Booking bar with click popover ───────────────────────────────────────────

function BookingBar({
  timezone,
  clip,
  style,
}: {
  clip: {
    res: ReservationRecord;
    startCol: number;
    endCol: number;
    startsInWindow: boolean;
    endsInWindow: boolean;
  };
  style: { barBg: string; dot: string; label: string };
  timezone?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const start = new Date(clip.res.start_at);
  const end = new Date(clip.res.end_at);
  const nights = Math.max(
    1,
    Math.round((Date.parse(calendarInstantKey(clip.res.end_at, timezone)) - Date.parse(calendarInstantKey(clip.res.start_at, timezone))) / 86400000),
  );
  const dateFmt = (d: Date) =>
    formatInTimeZone(d, { weekday: "short", month: "short", day: "numeric" }, timezone);
  const timeFmt = (d: Date) =>
    formatInTimeZone(d, { hour: "numeric", minute: "2-digit" }, timezone);

  return (
    <div
      className="relative min-w-0"
      ref={ref}
      style={{
        gridColumn: `${clip.startCol + 1} / span ${clip.endCol - clip.startCol + 1}`,
      }}
    >
      <button
        className={`flex w-full items-center gap-1.5 truncate px-3 text-[11px] font-semibold text-white transition hover:opacity-90 ${style.barBg} ${
          clip.startsInWindow ? "rounded-l-full" : ""
        } ${clip.endsInWindow ? "rounded-r-full" : ""}`}
        onClick={() => setOpen((v) => !v)}
        style={{ minHeight: "28px" }}
        title={`${style.label} · ${nights} night${nights === 1 ? "" : "s"} · ${dateFmt(start)} → ${dateFmt(end)}`}
        type="button"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
        <span className="truncate">
          {clip.startsInWindow
            ? `${style.label}${clip.res.guest_name ? ` · ${clip.res.guest_name}` : ""}`
            : `…${style.label}`}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl border border-border/70 bg-card p-4 text-xs shadow-xl">
          <div className="flex items-center justify-between">
            <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-bold uppercase tracking-wider text-white ${style.barBg}`}>
              {style.label}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {nights} night{nights === 1 ? "" : "s"}
            </span>
          </div>
          {clip.res.guest_name && (
            <p className="mt-3 text-sm font-semibold">{clip.res.guest_name}</p>
          )}
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Check-in</dt>
              <dd className="text-right font-medium">
                {dateFmt(start)}
                <br />
                <span className="text-muted-foreground">{timeFmt(start)}</span>
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Checkout</dt>
              <dd className="text-right font-medium">
                {dateFmt(end)}
                <br />
                <span className="text-muted-foreground">{timeFmt(end)}</span>
              </dd>
            </div>
          </dl>
          {clip.res.summary && (
            <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
              {clip.res.summary}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
