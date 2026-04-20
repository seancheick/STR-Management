import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { updatePropertyAction } from "@/app/(admin)/dashboard/properties/actions";
import { CalendarSourceRow } from "@/components/calendar/calendar-source-row";
import { PropertyForm } from "@/components/properties/property-form";
import { RecurringTasksSection } from "@/components/properties/recurring-tasks-section";
import { requireRole } from "@/lib/auth/session";
import { listCalendarSourcesForProperty } from "@/lib/queries/calendar";
import { getProperty } from "@/lib/queries/properties";
import { listRecurringTasksForProperty } from "@/lib/queries/recurring-tasks";
import { listActiveCleaners } from "@/lib/queries/team";

type EditPropertyPageProps = {
  params: Promise<{
    propertyId: string;
  }>;
};

export default async function EditPropertyPage({ params }: EditPropertyPageProps) {
  await requireRole(["owner", "admin"]);
  const { propertyId } = await params;
  const [propertyResult, calendarSources, recurringTasks, cleaners] =
    await Promise.all([
      getProperty(propertyId),
      listCalendarSourcesForProperty(propertyId),
      listRecurringTasksForProperty(propertyId),
      listActiveCleaners(),
    ]);

  if (!propertyResult.data) {
    notFound();
  }

  const action = updatePropertyAction.bind(null, propertyId);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-3">
        <Link className="text-sm text-muted-foreground" href="/dashboard/properties">
          ← Back to properties
        </Link>
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Edit property
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            {propertyResult.data.name}
          </h1>
        </div>
      </div>

      {propertyResult.error ? (
        <section className="rounded-[1.5rem] border border-destructive/30 bg-card p-6">
          <p className="text-sm text-muted-foreground">{propertyResult.error}</p>
        </section>
      ) : (
        <section className="rounded-[1.75rem] border border-border/70 bg-card p-6 shadow-sm">
          <PropertyForm
            action={action}
            property={propertyResult.data}
            submitLabel="Save property"
          />
        </section>
      )}

      {/* Calendar sync — inline on property edit */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Calendar sync
          </h2>
          <Link
            className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-xs font-semibold text-[#f7f5ef] transition hover:opacity-90"
            href={`/dashboard/calendar?propertyId=${propertyId}#add-source` as Route}
          >
            + Add iCal
          </Link>
        </div>
        {calendarSources.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/70 p-5 text-sm text-muted-foreground">
            No calendar sources connected. Add the iCal URL from Airbnb / VRBO to
            auto-create cleaning jobs from bookings.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {calendarSources.map((source) => (
              <CalendarSourceRow key={source.id} source={source} />
            ))}
          </div>
        )}
      </section>

      {/* Recurring work — deep clean, HVAC filters, etc. */}
      <RecurringTasksSection
        cleaners={cleaners}
        propertyId={propertyId}
        tasks={recurringTasks}
      />
    </main>
  );
}

