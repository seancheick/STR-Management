import type { AssignmentScheduleRecord } from "@/lib/queries/assignments";
import { getCleaningTiming } from "@/lib/services/cleaning-timing";
import { CleaningTiming } from "@/components/shared/cleaning-timing";

export function CleaningCalendarEvent({ assignment, onClick, dimmed = false, propertyName }: {
  assignment: AssignmentScheduleRecord; onClick: () => void; dimmed?: boolean; propertyName?: string;
}) {
  const timing = getCleaningTiming(assignment);
  const complete = ["approved", "completed_pending_review"].includes(assignment.status);
  const reclean = assignment.status === "needs_reclean";
  const urgent = !complete && (timing.mode === "firm" || timing.mode === "conflict" || reclean);
  const person = assignment.cleaners?.full_name?.split(" ")[0] ?? "Unassigned";
  const label = reclean ? "Re-clean" : complete ? "Completed" : !assignment.cleaner_id ? "Assign cleaner" : person;
  const description = `${propertyName ?? assignment.properties?.name ?? "Property"} · ${person} · ${complete ? "Completed cleaning" : `${timing.summary}. ${timing.detail}`}`;
  return (
    <button type="button" onClick={onClick} title={description} aria-label={description}
      data-cleaning-event={complete ? "complete" : timing.mode}
      className={`w-full min-w-0 min-h-11 rounded-md border border-border/60 bg-card px-2 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${dimmed ? "opacity-40" : ""}`}>
      <span className="mb-1 flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${urgent ? "bg-destructive" : complete ? "bg-accent" : "bg-primary"}`} />
        <span className="min-w-0 break-words">{label}{complete && assignment.cleaner_id ? ` · ${person}` : ""}</span>
      </span>
      {complete ? <span className="block text-[11px] leading-snug text-muted-foreground">Recorded cleaning</span> : <CleaningTiming timing={timing} compact />}
    </button>
  );
}
