import { getCleaningTiming } from "@/lib/services/cleaning-timing";

type Timing = ReturnType<typeof getCleaningTiming>;

/** Same information hierarchy on a calendar cell and on a cleaner's phone. */
export function CleaningTiming({ timing, compact = false }: { timing: Timing; compact?: boolean }) {
  const firm = timing.mode === "firm";
  const time = firm ? `${timing.startLabel}–${timing.deadlineLabel}` : timing.mode === "flexible" ? `After ${timing.startLabel}` : timing.summary;
  const duration = timing.minutes === null ? null : timing.minutes % 60 === 0 ? `${timing.minutes / 60} hours` : `${Math.floor(timing.minutes / 60)}h ${timing.minutes % 60}m`;
  return (
    <div className="min-w-0" data-cleaning-timing={timing.mode}>
      <p className={`${compact ? "text-xs" : "text-base"} font-semibold tabular-nums leading-snug text-foreground`}>{time}</p>
      <p className={`mt-0.5 ${compact ? "text-[11px]" : "text-sm"} leading-snug ${firm || timing.mode === "conflict" ? "text-destructive" : "text-muted-foreground"}`}>
        {firm ? "Same-day arrival" : timing.mode === "flexible" ? "Flexible start" : timing.mode === "conflict" ? "Review times" : "Scheduled deadline"}
        {!compact && firm && duration ? ` · ${duration} to clean` : ""}
      </p>
      {!compact && <p className="mt-2 text-sm leading-5 text-muted-foreground">{timing.detail}</p>}
    </div>
  );
}
