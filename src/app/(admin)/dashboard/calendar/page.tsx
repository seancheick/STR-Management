import { requireRole } from "@/lib/auth/session";
import { listCalendarSources, listRecentSyncLogs } from "@/lib/queries/calendar";
import { listProperties } from "@/lib/queries/properties";
import { AddCalendarSourceForm } from "@/components/calendar/add-calendar-source-form";
import { CalendarSourceRow } from "@/components/calendar/calendar-source-row";
import { addCalendarSourceAction } from "./actions";

const platformLabels: Record<string, string> = {
  airbnb: "Airbnb",
  vrbo: "VRBO",
  booking: "Booking.com",
  other: "Other",
};

const resultColors: Record<string, string> = {
  success: "text-green-600",
  partial: "text-amber-600",
  failed: "text-red-600",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type CalendarPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  await requireRole(["owner", "admin", "supervisor"]);

  const params = (await searchParams) ?? {};
  const propertyIdParam =
    typeof params.propertyId === "string" ? params.propertyId : undefined;

  const [sources, syncLogs, propertiesResult] = await Promise.all([
    listCalendarSources(),
    listRecentSyncLogs(15),
    listProperties(),
  ]);

  const preselectedProperty = propertyIdParam
    ? propertiesResult.data.find((p) => p.id === propertyIdParam)
    : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Automation</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Calendar sync</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sync Airbnb / VRBO iCal feeds — checkout dates auto-create unassigned cleaning
          assignments. Runs every 6 hours.
        </p>
      </div>

      {/* Active sources */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Calendar sources</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
            {sources.length}
          </span>
        </div>

        {sources.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-border bg-card/70 p-6">
            <p className="text-sm text-muted-foreground">
              No calendar sources yet. Add one below.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sources.map((source) => (
              <CalendarSourceRow key={source.id} source={source} />
            ))}
          </div>
        )}
      </section>

      {/* Add source form */}
      <section
        className="scroll-mt-8 rounded-[1.75rem] border border-border/70 bg-card p-6 shadow-sm"
        id="add-source"
      >
        <h2 className="mb-2 text-base font-semibold">Add calendar source</h2>
        {preselectedProperty && (
          <p className="mb-4 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
            Adding a source for <strong className="font-semibold">{preselectedProperty.name}</strong>.
            Paste the iCal URL from Airbnb → Calendar → Export calendar.
          </p>
        )}
        <AddCalendarSourceForm
          action={addCalendarSourceAction}
          defaultPropertyId={propertyIdParam}
          properties={propertiesResult.data}
        />
      </section>

      {/* Sync history */}
      {syncLogs.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Sync history</h2>
          <div className="rounded-[1.75rem] border border-border/70 bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">Property</th>
                  <th className="px-5 py-3 font-medium">Result</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium">Conflicts</th>
                  <th className="px-5 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {syncLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-5 py-3 font-medium">
                      {log.calendar_source?.name ?? "—"}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {platformLabels[log.calendar_source?.platform ?? ""] ?? ""}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {log.properties?.name ?? "—"}
                    </td>
                    <td className={`px-5 py-3 font-medium ${resultColors[log.result] ?? ""}`}>
                      {log.result}
                    </td>
                    <td className="px-5 py-3">{log.assignments_created}</td>
                    <td className="px-5 py-3">
                      {log.conflict_count > 0 ? (
                        <span className="font-medium text-amber-600">{log.conflict_count}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(log.synced_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
