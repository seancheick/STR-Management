"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { bulkAssignCleanerAction } from "@/app/(admin)/dashboard/assignments/actions";
import type { AssignmentListRecord } from "@/lib/queries/assignments";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { planAssignments, type PlanningPreset } from "@/lib/services/assignment-planning";
import { calendarListingId } from "@/lib/services/calendar-display";
import { formatInTimeZone } from "@/lib/ical/timezone";
import { showToast } from "@/components/ui/toast";

export function AssignmentPlanner({ assignments, cleaners, now, propertyId }: { assignments: AssignmentListRecord[]; cleaners: TeamMemberRecord[]; now: string; propertyId?: string | null }) {
  const router = useRouter();
  const [preset, setPreset] = useState<PlanningPreset>("seven-days");
  const [count, setCount] = useState(3);
  const [assignmentMode, setAssignmentMode] = useState<"request" | "direct">("request");
  const [cleanerId, setCleanerId] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const jobs = useMemo(() => planAssignments(assignments.filter(a => !applied.has(a.id) && (!propertyId || calendarListingId(a) === propertyId)), preset, now, count), [assignments, preset, now, count, propertyId, applied]);
  const selected = jobs.filter(a => !excluded.has(a.id));
  const cleaner = cleaners.find(c => c.id === cleanerId);
  function apply() {
    startTransition(async () => {
      try {
        const result = await bulkAssignCleanerAction(selected.map(a => a.id), cleanerId, assignmentMode);
        if (result.error) { setMessage(result.error); showToast(result.error, "error"); return; }
        const skipped = selected.length - result.assigned;
        const text = `Assigned ${result.assigned} cleaning${result.assigned === 1 ? "" : "s"} to ${cleaner?.full_name ?? "the cleaner"}.${skipped ? ` ${skipped} changed since this page loaded and ${skipped === 1 ? "was" : "were"} skipped.` : ""}`;
        setMessage(text); showToast(text);
        setApplied(previous => new Set([...previous, ...selected.map(a => a.id)]));
        setExcluded(new Set()); router.refresh();
      } catch { setMessage("Could not assign cleanings. Refresh and try again."); }
    });
  }
  return (
    <details className="group rounded-2xl border border-border/70 bg-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
        <span>Assign upcoming cleanings <span className="ml-1 text-sm font-normal text-muted-foreground">· {assignments.filter(a => !applied.has(a.id) && (!propertyId || calendarListingId(a) === propertyId)).length} unassigned</span></span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-4 border-t border-border/60 p-5">
        <p className="text-sm leading-5 text-muted-foreground">Choose a period, review the cleanings, then choose who gets them. Existing assignments stay with their cleaner.{propertyId ? " Applies to the selected listing." : " Applies across all listings."}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium"><span>Which cleanings?</span>
            <select aria-label="Which cleanings?" className="h-11 w-full rounded-xl border border-input bg-background px-3" value={preset} disabled={pending} onChange={e => {setPreset(e.target.value as PlanningPreset); setExcluded(new Set()); setMessage("");}}>
              <option value="this-week">This week · through Sunday</option><option value="next-week">Next week · Monday–Sunday</option>
              <option value="seven-days">Next 7 days · including today</option><option value="next-three">Next 3 cleanings</option><option value="next-ten">Next 10 cleanings</option><option value="next-count">Choose a number</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium"><span>Assign to</span><select aria-label="Assign to" className="h-11 w-full rounded-xl border border-input bg-background px-3" value={cleanerId} disabled={pending} onChange={e => setCleanerId(e.target.value)}><option value="">Choose a cleaner</option>{cleaners.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
        </div>
        <label className="block text-sm font-medium">Assignment type<select value={assignmentMode} disabled={pending} onChange={e=>setAssignmentMode(e.target.value as "request" | "direct")} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3"><option value="request">Request · cleaner accepts or declines</option><option value="direct">Direct assign · confirmed, no acceptance needed</option></select></label>
        {preset === "next-count" && <label className="flex items-center gap-3 text-sm">Number of cleanings<input aria-label="Number of cleanings" type="number" min="1" max="100" value={count} disabled={pending} onChange={e=>{setCount(Number(e.target.value)); setExcluded(new Set());}} className="h-11 w-24 rounded-xl border border-input bg-background px-3" /></label>}
        {!!jobs.length && <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">Review {jobs.length} cleaning{jobs.length === 1 ? "" : "s"}</span><button type="button" disabled={pending} className="min-h-11 px-2 text-primary underline underline-offset-4" onClick={() => setExcluded(selected.length ? new Set(jobs.map(job => job.id)) : new Set())}>{selected.length ? "Clear selection" : "Select all"}</button></div>}
        <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
          {jobs.map(job => <label className="flex min-h-14 cursor-pointer items-start gap-3 py-3" key={job.id}>
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary" checked={!excluded.has(job.id)} disabled={pending} onChange={()=>setExcluded(previous=>{const next=new Set(previous); if(next.has(job.id))next.delete(job.id); else next.add(job.id); return next;})} />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{job.properties?.name ?? "Property"}</span><span className="mt-1 block text-xs text-muted-foreground">{formatInTimeZone(job.checkout_at ?? job.due_at, {weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}, job.properties?.timezone)} · ${Number(job.fixed_payout_amount ?? 0).toFixed(2)}</span></span>
          </label>)}
          {!jobs.length && <p className="py-4 text-sm text-muted-foreground">No unassigned cleanings in this selection.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4"><p className="text-sm text-muted-foreground">{selected.length} selected · You can uncheck any job.</p><button type="button" onClick={apply} disabled={pending || !selected.length || !cleanerId} className="min-h-11 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">{pending ? "Assigning…" : `Assign ${selected.length} cleaning${selected.length===1?"":"s"}${cleaner ? ` to ${cleaner.full_name}` : ""}`}</button></div>
        {message && <p role="status" className="text-sm">{message}</p>}
      </div>
    </details>
  );
}
