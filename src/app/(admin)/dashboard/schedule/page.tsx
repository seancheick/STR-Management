import { requireRole } from "@/lib/auth/session";
import { listAssignmentsForSchedule } from "@/lib/queries/assignments";
import { listReservationsForRange } from "@/lib/queries/calendar";
import { listProperties } from "@/lib/queries/properties";
import { listActiveCleaners } from "@/lib/queries/team";
import { ScheduleGrid } from "@/components/schedule/schedule-grid";
import { MonthView } from "@/components/schedule/month-view";

type SchedulePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getWeekDays(weekOffset: number): Date[] {
  // Start from the current Monday, offset by weekOffset weeks
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getMonthDays(monthOffset: number): Date[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + monthOffset;

  // Normalize — JS Date handles overflow (e.g. month 13 = Jan next year)
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const days: Date[] = [];
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  await requireRole(["owner", "admin", "supervisor"]);

  const params = (await searchParams) ?? {};
  const view = params.view === "month" ? "month" : "week";
  const weekOffset = typeof params.week === "string" ? parseInt(params.week, 10) || 0 : 0;
  const monthOffset = typeof params.month === "string" ? parseInt(params.month, 10) || 0 : 0;
  const cleanerFilter =
    typeof params.cleaner === "string" && params.cleaner.length > 0
      ? params.cleaner
      : null;

  let rangeStart: Date;
  let rangeEnd: Date;
  let weekDayISOs: string[] = [];
  let monthDayISOs: string[] = [];

  if (view === "month") {
    const monthDays = getMonthDays(monthOffset);
    rangeStart = new Date(monthDays[0]);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(monthDays[monthDays.length - 1]);
    rangeEnd.setHours(23, 59, 59, 999);
    monthDayISOs = monthDays.map((d) => d.toISOString());
  } else {
    const weekDays = getWeekDays(weekOffset);
    rangeStart = new Date(weekDays[0]);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(weekDays[6]);
    rangeEnd.setHours(23, 59, 59, 999);
    weekDayISOs = weekDays.map((d) => d.toISOString());
  }

  const [propertiesResult, allAssignments, cleaners, reservations] = await Promise.all([
    listProperties(),
    listAssignmentsForSchedule(rangeStart.toISOString(), rangeEnd.toISOString()),
    listActiveCleaners(),
    listReservationsForRange(rangeStart.toISOString(), rangeEnd.toISOString()),
  ]);

  const activeProperties = propertiesResult.data.filter((p) => p.active);
  const assignments = cleanerFilter
    ? allAssignments.filter((a) =>
        cleanerFilter === "unassigned"
          ? a.cleaner_id === null
          : a.cleaner_id === cleanerFilter,
      )
    : allAssignments;

  const preserveParams = (over: Record<string, string | null>) => {
    const entries: Array<[string, string]> = [];
    if (view) entries.push(["view", view]);
    if (weekOffset) entries.push(["week", String(weekOffset)]);
    if (monthOffset) entries.push(["month", String(monthOffset)]);
    if (cleanerFilter) entries.push(["cleaner", cleanerFilter]);
    for (const [k, v] of Object.entries(over)) {
      const idx = entries.findIndex(([ek]) => ek === k);
      if (idx >= 0) entries.splice(idx, 1);
      if (v !== null) entries.push([k, v]);
    }
    return entries.length > 0
      ? `?${entries.map(([k, v]) => `${k}=${v}`).join("&")}`
      : "";
  };

  const unassignedCount = allAssignments.filter((a) => a.cleaner_id === null).length;

  return (
    <main className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Operations</p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">Schedule</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Click any assignment to view details and assign a cleaner.
        </p>
      </div>

      {/* Cleaner filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Filter
        </span>
        {[
          { key: null, label: "All", count: allAssignments.length },
          { key: "unassigned", label: "Unassigned", count: unassignedCount },
          ...cleaners.map((c) => ({
            key: c.id,
            label: c.full_name,
            count: allAssignments.filter((a) => a.cleaner_id === c.id).length,
          })),
        ].map(({ key, label, count }) => {
          const active = cleanerFilter === key || (key === null && !cleanerFilter);
          return (
            <a
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
                active
                  ? "bg-primary text-[#f7f5ef]"
                  : "border border-border/70 bg-card text-foreground hover:bg-muted"
              }`}
              href={preserveParams({ cleaner: key })}
              key={key ?? "all"}
            >
              {label}
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                    active ? "bg-white/20" : "bg-muted"
                  }`}
                >
                  {count}
                </span>
              )}
            </a>
          );
        })}
      </div>

      {view === "month" ? (
        <MonthView
          properties={activeProperties}
          assignments={assignments}
          cleaners={cleaners}
          reservations={reservations}
          monthDays={monthDayISOs}
          monthOffset={monthOffset}
          view="month"
        />
      ) : (
        <ScheduleGrid
          properties={activeProperties}
          assignments={assignments}
          cleaners={cleaners}
          weekDays={weekDayISOs}
          weekOffset={weekOffset}
          view="week"
        />
      )}
    </main>
  );
}
