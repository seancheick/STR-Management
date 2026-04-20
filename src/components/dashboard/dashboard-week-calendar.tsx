"use client";

import { AlertTriangle, LogOut, LogIn, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AssignmentScheduleRecord } from "@/lib/queries/assignments";
import type { PropertyRecord } from "@/lib/queries/properties";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { isTightTurnover } from "@/lib/domain/assignments";
import { AssignmentEditForm } from "@/components/schedule/assignment-edit-form";

type Pill =
  | {
      kind: "checkout";
      time: string;
      assignment: AssignmentScheduleRecord;
    }
  | {
      kind: "cleaning";
      time: string;
      assignment: AssignmentScheduleRecord;
    };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function sameLocalDay(a: string, day: Date): boolean {
  const d = new Date(a);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

function isToday(d: Date): boolean {
  const now = new Date();
  return sameLocalDay(now.toISOString(), d);
}

type DashboardWeekCalendarProps = {
  properties: PropertyRecord[];
  assignments: AssignmentScheduleRecord[];
  cleaners: TeamMemberRecord[];
  days: string[]; // 7 ISO strings at midnight UTC
};

const FOCUS_STORAGE_KEY = "dashboard-focus-today";

export function DashboardWeekCalendar({
  properties,
  assignments,
  cleaners,
  days,
}: DashboardWeekCalendarProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusToday, setFocusToday] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FOCUS_STORAGE_KEY);
      if (stored === "1") setFocusToday(true);
    } catch {
      // ignore
    }
  }, []);

  function toggleFocus() {
    setFocusToday((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(FOCUS_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }
  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const dayDates = useMemo(() => {
    const all = days.map((d) => new Date(d));
    if (!focusToday) return all;
    const todayOnly = all.filter((d) => isToday(d));
    return todayOnly.length > 0 ? todayOnly : all.slice(0, 1);
  }, [days, focusToday]);

  /** Map "propertyId|dayIdx" → pills (checkout + cleaning) for that cell. */
  const cellMap = useMemo(() => {
    const map = new Map<string, Pill[]>();
    for (const a of assignments) {
      dayDates.forEach((day, idx) => {
        const key = `${a.property_id}|${idx}`;
        if (a.checkout_at && sameLocalDay(a.checkout_at, day)) {
          const arr = map.get(key) ?? [];
          arr.push({ kind: "checkout", time: formatTime(a.checkout_at), assignment: a });
          map.set(key, arr);
        }
        if (sameLocalDay(a.due_at, day)) {
          const arr = map.get(key) ?? [];
          arr.push({ kind: "cleaning", time: formatTime(a.due_at), assignment: a });
          map.set(key, arr);
        }
      });
    }
    return map;
  }, [assignments, dayDates]);

  const activeProperties = properties.filter((p) => p.active);

  return (
    <section aria-label="Week calendar">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">This week at a glance</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Checkouts, check-ins, and cleanings due. Tap any pill to edit.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <button
            aria-pressed={focusToday}
            className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition ${
              focusToday
                ? "border-primary bg-primary text-[#f7f5ef]"
                : "border-border/70 bg-card text-foreground hover:bg-muted"
            }`}
            onClick={toggleFocus}
            type="button"
          >
            {focusToday ? "Showing: Today" : "Focus: Today"}
          </button>
          <Legend color="bg-orange-400" label="Checkout" />
          <Legend color="bg-green-400" label="Cleaning due" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth: `${180 + dayDates.length * 120}px` }}
        >
          <thead>
            <tr className="border-b border-border/60">
              <th className="sticky left-0 z-10 w-44 border-r border-border/60 bg-card px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Property
              </th>
              {dayDates.map((d) => {
                const today = isToday(d);
                return (
                  <th
                    className={`px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wider ${
                      today ? "bg-primary/5" : ""
                    }`}
                    key={d.toISOString()}
                  >
                    <span className={today ? "text-primary" : "text-muted-foreground"}>
                      {d.toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                    <span
                      className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                        today ? "bg-primary text-[#f7f5ef]" : "text-foreground"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/40">
            {activeProperties.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                  colSpan={dayDates.length + 1}
                >
                  No active properties yet.
                </td>
              </tr>
            ) : (
              activeProperties.map((property) => (
                <tr className="hover:bg-muted/20" key={property.id}>
                  <td className="sticky left-0 z-10 w-44 border-r border-border/60 bg-card px-4 py-3 align-top">
                    <p className="truncate text-sm font-medium leading-snug">{property.name}</p>
                    {property.city && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {property.city}
                      </p>
                    )}
                  </td>

                  {dayDates.map((day, idx) => {
                    const key = `${property.id}|${idx}`;
                    const pills = cellMap.get(key) ?? [];
                    const today = isToday(day);
                    return (
                      <td
                        className={`min-w-[120px] px-1.5 py-1.5 align-top ${
                          today ? "bg-primary/[0.03]" : ""
                        }`}
                        key={idx}
                      >
                        {pills.length === 0 ? (
                          <div className="h-6" />
                        ) : (
                          <div className="flex flex-col gap-1">
                            {pills.map((pill, pillIdx) => (
                              <PillButton
                                key={`${pill.assignment.id}-${pill.kind}-${pillIdx}`}
                                onClick={() => setSelectedId(pill.assignment.id)}
                                pill={pill}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit drawer */}
      {selected && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
            onClick={() => setSelectedId(null)}
          />
          <aside
            aria-label="Edit assignment"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto bg-card shadow-2xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Edit assignment
                </p>
                <h2 className="mt-0.5 text-lg font-semibold">
                  {selected.properties?.name ?? "Assignment"}
                </h2>
              </div>
              <button
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
                onClick={() => setSelectedId(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 px-5 py-5">
              <AssignmentEditForm
                assignment={selected}
                cleaners={cleaners}
                onCancel={() => setSelectedId(null)}
                onDeleted={() => setSelectedId(null)}
                onSaved={() => setSelectedId(null)}
              />
            </div>
          </aside>
        </>
      )}
    </section>
  );
}

function PillButton({ pill, onClick }: { pill: Pill; onClick: () => void }) {
  const cleanerName = pill.assignment.cleaners?.full_name;
  const cleanerLabel = cleanerName
    ? cleanerName.split(" ")[0]
    : pill.assignment.status === "unassigned"
      ? "Assign"
      : null;
  const tight = isTightTurnover(pill.assignment.checkout_at, pill.assignment.due_at);

  if (pill.kind === "checkout") {
    return (
      <button
        className={`flex w-full items-center gap-1 rounded-lg border px-1.5 py-1 text-left text-[11px] font-medium transition hover:shadow-sm ${
          tight
            ? "border-red-300 bg-red-50 text-red-800 hover:border-red-400"
            : "border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-300"
        }`}
        onClick={onClick}
        type="button"
      >
        {tight ? (
          <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
        ) : (
          <LogOut className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate tabular-nums">{pill.time}</span>
        <span className="truncate opacity-70">{tight ? "tight" : "checkout"}</span>
      </button>
    );
  }

  return (
    <button
      className={`flex w-full items-center gap-1 rounded-lg border px-1.5 py-1 text-left text-[11px] font-medium transition hover:shadow-sm ${
        tight
          ? "border-red-300 bg-red-50 text-red-800 hover:border-red-400"
          : "border-green-200 bg-green-50 text-green-800 hover:border-green-300"
      }`}
      onClick={onClick}
      type="button"
    >
      {tight ? (
        <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      ) : (
        <Sparkles className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate tabular-nums">{pill.time}</span>
      <span className="truncate opacity-70">{cleanerLabel ?? "clean"}</span>
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}

// Exported as a convenience in case other surfaces want to emit a check-in pill
export function CheckinIcon() {
  return <LogIn className="h-2.5 w-2.5" aria-hidden="true" />;
}
