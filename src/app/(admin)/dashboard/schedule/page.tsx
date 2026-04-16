import { requireRole } from "@/lib/auth/session";
import { listAssignmentsForSchedule } from "@/lib/queries/assignments";
import { listProperties } from "@/lib/queries/properties";
import { listActiveCleaners } from "@/lib/queries/team";
import { ScheduleGrid } from "@/components/schedule/schedule-grid";

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

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  await requireRole(["owner", "admin", "supervisor"]);

  const params = (await searchParams) ?? {};
  const weekOffset = typeof params.week === "string" ? parseInt(params.week, 10) || 0 : 0;

  const weekDays = getWeekDays(weekOffset);
  const weekStart = new Date(weekDays[0]);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekDays[6]);
  weekEnd.setHours(23, 59, 59, 999);

  const [propertiesResult, assignments, cleaners] = await Promise.all([
    listProperties(),
    listAssignmentsForSchedule(weekStart.toISOString(), weekEnd.toISOString()),
    listActiveCleaners(),
  ]);

  const weekDayISOs = weekDays.map((d) => d.toISOString());

  return (
    <main className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Operations</p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">Schedule</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Click any assignment to view details and assign a cleaner.
        </p>
      </div>

      <ScheduleGrid
        properties={propertiesResult.data.filter((p) => p.active)}
        assignments={assignments}
        cleaners={cleaners}
        weekDays={weekDayISOs}
        weekOffset={weekOffset}
      />
    </main>
  );
}
