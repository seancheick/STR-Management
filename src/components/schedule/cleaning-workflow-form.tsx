"use client";
import {suggestCleaningOperation} from "@/lib/services/cleaning-workflow";
import { useActionState, useEffect, useState } from "react";
import { manageCleaningAction } from "@/app/(admin)/dashboard/schedule/actions";
import type { TeamMemberRecord } from "@/lib/queries/team";
import type { EditableAssignment } from "./assignment-edit-form";
import { showToast } from "@/components/ui/toast";

export function CleaningWorkflowForm({assignment, cleaners, onSaved}: {assignment: EditableAssignment; cleaners: TeamMemberRecord[]; onSaved: () => void}) {
 const [state, action, pending] = useActionState(manageCleaningAction, {status: "idle", message: null});
 const [openedAt] = useState(() => Date.now());
 const [operation, setOperation] = useState<"direct"|"request"|"complete">(() => suggestCleaningOperation(assignment,new Date(openedAt)));
 const canAssign = ["unassigned", "assigned", "confirmed", "needs_reclean"].includes(assignment.status);
 const canComplete = ["unassigned", "assigned", "confirmed", "in_progress", "completed_pending_review", "needs_reclean"].includes(assignment.status);
 const pastCheckout = Date.parse(assignment.checkout_at ?? assignment.due_at) <= openedAt;
 useEffect(() => { if(state.status === "success") {showToast(state.message ?? "Cleaning updated."); onSaved();} }, [state, onSaved]);
 if (!canAssign && !canComplete) return null;
 return <form action={action} className="space-y-3 rounded-xl border border-border p-3">
  <input type="hidden" name="assignmentId" value={assignment.id} />
  <label className="block text-sm font-medium">Cleaning action<select name="operation" value={operation} onChange={e=>setOperation(e.target.value as "direct"|"request"|"complete")} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3">
   {canAssign && <><option value="direct">Direct assign · already agreed</option><option value="request">Request · cleaner accepts or declines</option></>}
   {canComplete && <option value="complete">Record completed work</option>}
  </select></label>
  <label className="block text-sm font-medium">Cleaner<select name="cleanerId" required defaultValue={assignment.cleaner_id ?? ""} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">Choose a cleaner</option>{cleaners.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
  {operation === "complete" ? <><p className="text-xs text-muted-foreground">Records the work as finished and approved without requiring cleaner acceptance. The shared balance updates once; historical work already in the ledger is not charged again. This does not record a payment.</p>{!pastCheckout && <p role="alert" className="text-xs text-amber-800">The checkout or service date must have passed before recording completion.</p>}<label className="block text-sm">Reason<textarea name="reason" defaultValue="Recorded by host: cleaning already completed." required minLength={3} maxLength={1000} className="mt-1 min-h-20 w-full rounded-xl border border-input bg-background p-3" /></label><label className="flex items-start gap-2 text-sm"><input name="confirmed" type="checkbox" required className="mt-1" />I confirm this cleaning was completed and approve it for payment.</label></> : <p className="text-xs text-muted-foreground">{operation === "direct" ? "Adds a confirmed cleaning to the cleaner’s schedule. The notification is informational; no acceptance is needed." : "Sends a request. The cleaning stays pending until the cleaner accepts."}</p>}
  {state.status === "error" && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
  <button disabled={pending || (operation === "complete" && !pastCheckout)} className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Saving…" : operation === "complete" ? "Confirm completed and approved" : operation === "direct" ? "Confirm direct assignment" : "Send request"}</button>
 </form>;
}
