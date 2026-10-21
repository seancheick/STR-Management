"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { correctCleaningScopeAction, getCleaningScopeAction } from "@/app/actions/cleaning-scope";
import { JOBS_CHANGED_EVENT } from "@/lib/services/job-updates";
import { formatInTimeZone } from "@/lib/ical/timezone";

type Preview = NonNullable<Awaited<ReturnType<typeof getCleaningScopeAction>>>;
export function CleaningScopeEditor({ assignmentId, onSaved }: { assignmentId: string; onSaved: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failed, setFailed] = useState(false);
  const [scopeId, setScopeId] = useState("");
  const [total, setTotal] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const request = useRef<{ key: string; id: string } | null>(null);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    getCleaningScopeAction(assignmentId).then(data => {
      if (!active || !data) return;
      setPreview(data); setScopeId(data.currentScopeId); setTotal(String(data.currentTotal));
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [assignmentId]);
  if (failed) return <p className="mt-5 text-sm text-destructive">Could not load cleaning scope. Close and reopen this cleaning to try again.</p>;
  if (!preview) return null;
  const scope = preview.options.find(option => option.id === scopeId);
  const delta = Number(total) - preview.currentTotal;
  function save(event: FormEvent) {
    event.preventDefault();
    const key = JSON.stringify({ scopeId, total, reason, expected: preview!.currentTotal });
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    const input = { requestId: request.current.id, assignmentId, scopePropertyId: scopeId, total: Number(total), expectedCurrentTotal: preview!.currentTotal, expectedScopePropertyId: preview!.currentScopeId, reason };
    startTransition(async () => {
      try {
        const result = await correctCleaningScopeAction(input);
        if (result.error) { setMessage(result.error); return; }
        window.dispatchEvent(new Event(JOBS_CHANGED_EVENT)); router.refresh(); onSaved();
      } catch { setMessage("Could not confirm the correction. Retry with the same details; it will not be duplicated."); }
    });
  }
  return <section className="mt-5 space-y-3 rounded-2xl border border-border/70 bg-background/60 p-4" aria-label="Cleaning scope correction">
    <h3 className="font-semibold">Cleaning scope</h3>
    <p className="text-sm">Booked: {preview.bookedListing?.name ?? "Original listing"}</p>
    {preview.reservation && <p className="text-sm text-muted-foreground">{preview.reservation.guest_name ?? "Guest stay"} · checkout {formatInTimeZone(preview.reservation.end_at, { month: "short", day: "numeric", year: "numeric" })}</p>}
    <p className="text-sm">Actual cleaning: {preview.options.find(option => option.id === preview.currentScopeId)?.name ?? "Current configuration"} · ${preview.currentTotal.toFixed(2)}</p>
    <details><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary">Correct scope and pay</summary>
      <p className="mb-3 text-xs leading-5 text-muted-foreground">Use this when the guest used a different configuration. The original booking, completion evidence and payments stay in the history. {preview.financialHistoryLocked ? "The pay difference will be a separate adjustment." : "The cleaning total will be updated with an audit record."}</p>
      <form onSubmit={save} className="space-y-3"><fieldset disabled={pending} className="min-w-0 space-y-3 disabled:opacity-60">
        <label className="block space-y-1 text-sm"><span>Actual cleaning configuration</span><select value={scopeId} onChange={event => { setScopeId(event.target.value); const option = preview.options.find(item => item.id === event.target.value); if (option?.default_clean_price != null) setTotal(String(option.default_clean_price)); setConfirmed(false); }} required className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base">{preview.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label className="block space-y-1 text-sm"><span>Corrected total pay ($), including extras</span><input value={total} onChange={event => { setTotal(event.target.value); setConfirmed(false); }} required type="number" min="0.01" max="100000" step="0.01" inputMode="decimal" className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base" /></label>
        <label className="block space-y-1 text-sm"><span>Reason</span><textarea value={reason} onChange={event => { setReason(event.target.value); setConfirmed(false); }} required minLength={3} maxLength={1000} placeholder="Guest used the third bedroom." className="min-h-20 w-full rounded-xl border border-input bg-background p-3 text-base" /></label>
        <div className="rounded-xl bg-muted p-3 text-sm leading-6"><p>{scope?.name ?? "Select a configuration"}</p><p>${preview.currentTotal.toFixed(2)} → ${Number.isFinite(Number(total)) ? Number(total).toFixed(2) : "—"} ({delta >= 0 ? "+" : "−"}${Number.isFinite(delta) ? Math.abs(delta).toFixed(2) : "—"})</p><p className="mt-1 text-xs text-muted-foreground">{preview.checklistMode}</p></div>
        <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required className="mt-1" /><span>I confirm this cleaning configuration and pay correction.</span></label>
        <button type="submit" disabled={!confirmed || !scope} className="min-h-11 w-full rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Applying correction…" : "Apply correction"}</button>
      </fieldset></form>
    </details>
    {message && <p role="status" className="text-sm text-destructive">{message}</p>}
    {preview.corrections.length > 0 && <details><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Correction history ({preview.corrections.length})</summary><ul className="space-y-3 text-sm">{preview.corrections.map(correction => <li key={correction.id}><p>{correction.reason}</p><p className="text-xs text-muted-foreground">{formatInTimeZone(correction.created_at, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</p></li>)}</ul></details>}
  </section>;
}
