"use client";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getJobPayAction, saveJobExtraAction, removeJobExtraAction } from "@/app/actions/job-extras";
import { JobPayBreakdown } from "@/components/shared/job-pay-breakdown";
import { JOBS_CHANGED_EVENT } from "@/lib/services/job-updates";

export function JobExtrasEditor({assignmentId}: {assignmentId:string}) {
  const [pay,setPay]=useState<Awaited<ReturnType<typeof getJobPayAction>>|null>(null);
  const [message,setMessage]=useState("");
  const [pending,startTransition]=useTransition();
  const requestId=useRef<{key:string;id:string}|null>(null);
  const router=useRouter();
  useEffect(()=>{let active=true;getJobPayAction(assignmentId).then(value=>{if(active)setPay(value);}).catch(()=>{if(active)setMessage("Could not load job pay. Close and reopen this job to try again.");});return()=>{active=false;};},[assignmentId]);
  async function refresh() {
    setPay(await getJobPayAction(assignmentId));
    window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));router.refresh();
  }
  function add(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const form=event.currentTarget;const fd=new FormData(form);
    const values={assignmentId,description:String(fd.get("description")).trim(),amount:String(fd.get("amount")),kind:String(fd.get("kind"))};
    const key=JSON.stringify({...values,amount:Number(values.amount)});
    if(requestId.current?.key!==key)requestId.current={key,id:crypto.randomUUID()};
    const input={...values,id:requestId.current.id};
    startTransition(async()=>{try{setMessage("");const result=await saveJobExtraAction(input);if(result.error){setMessage(result.error);return;}await refresh();requestId.current=null;form.reset();setMessage("Extra added to the job total.");}catch{setMessage("Could not confirm whether the extra was saved. Retry with the same details; it won’t be duplicated.");}});
  }
  return <section className="mt-5 space-y-4 rounded-2xl border border-border/70 bg-background/60 p-4" aria-label="Job pay and extras">
    <h3 className="font-semibold">Pay & extras</h3>
    {pay && <JobPayBreakdown total={pay.total} extras={pay.extras} />}
    {pay?.extras.map(extra=><div key={extra.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 break-words">{extra.description} · ${Number(extra.amount).toFixed(2)}</span><button type="button" disabled={pending || !pay.canEditExtras} className="min-h-11 shrink-0 px-2 text-muted-foreground underline" aria-label={`Remove ${extra.description}`} onClick={()=>startTransition(async()=>{try{const result=await removeJobExtraAction(assignmentId,extra.id);if(result.error){setMessage(result.error);return;}await refresh();setMessage("Extra removed.");}catch{setMessage("Could not remove the extra. Try again.");}})}>Remove</button></div>)}
    {pay?.editRestriction && <p className="text-xs leading-5 text-muted-foreground">{pay.editRestriction.replace("correct_cleaning_scope", "Correct scope and pay")}</p>}
    <details className="group"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary">Add an extra</summary>
      <p className="mb-4 text-xs leading-5 text-muted-foreground">Add a service or reimburse a purchase. These increase what the cleaner is owed; they don’t mark it paid. Paid and reconciled jobs are locked.</p>
      <form onSubmit={add} className="space-y-3"><fieldset disabled={pending || !pay || !pay.canEditExtras} className="min-w-0 space-y-3 disabled:opacity-60">
        <label className="block space-y-1 text-sm"><span>Description</span><input name="description" required maxLength={200} placeholder="Trash removal or supplies receipt" className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base" /></label>
        <label className="block space-y-1 text-sm"><span>Type</span><select name="kind" className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base"><option value="service">Extra service</option><option value="reimbursement">Purchase reimbursement</option></select></label>
        <label className="block space-y-1 text-sm"><span>Amount ($)</span><input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" max="100000" required className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base" /></label>
        <button type="submit" className="min-h-11 w-full rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">{pending?"Saving…":"Add extra"}</button>
      </fieldset></form>
    </details>
    {message&&<p role="status" className="text-sm leading-5">{message}</p>}
  </section>;
}
