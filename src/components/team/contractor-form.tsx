"use client";
import {useActionState,useRef,useEffect} from 'react';
import {saveContractorAction,inviteTeamMemberAction} from '@/app/(admin)/dashboard/team/actions';
import {keepValuesOnError} from "@/lib/form-values";
import type {TeamMemberRecord} from '@/lib/queries/team';
export function ContractorForm({person}:{person?:TeamMemberRecord}) {
 const requestId=useRef<string|null>(person?.id??null);
 const [state,action,pending]=useActionState(keepValuesOnError(saveContractorAction),{error:null});
 useEffect(()=>{if(state.saved)requestId.current=person?.id??null;},[state,person?.id]);
 return <form action={fd=>{requestId.current??=crypto.randomUUID();fd.set("id",requestId.current);action(fd);}} className="space-y-3"><input type="hidden" name="active" value={String(person?.active??true)}/>
 <p className="text-sm text-muted-foreground">Save their details without sending an invitation. Assign jobs, agree a price, and record completed work and payments as usual.</p>
 <label className="block text-sm">Name<input name="name" required maxLength={120} defaultValue={state.submitted?.name??person?.full_name} className="mt-1 min-h-12 w-full rounded-xl border border-input bg-background px-3 text-base"/></label>
 <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Phone (optional)<input name="phone" type="tel" maxLength={40} defaultValue={state.submitted?.phone??person?.phone??''} className="mt-1 min-h-12 w-full rounded-xl border border-input bg-background px-3 text-base"/></label><label className="block text-sm">Email (optional)<input name="email" type="email" maxLength={254} defaultValue={state.submitted?.email??person?.email??''} className="mt-1 min-h-12 w-full rounded-xl border border-input bg-background px-3 text-base"/></label></div>
 <label className="block text-sm">Details (optional)<textarea name="details" maxLength={2000} defaultValue={state.submitted?.details??person?.details??''} placeholder="Marketplace, agreed services, or useful notes" className="mt-1 min-h-24 w-full rounded-xl border border-input bg-background p-3 text-base"/></label>
 <button disabled={pending} className="min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">{pending?'Saving…':person?'Save details':'Add contractor'}</button>
 {state.error&&<p role="alert" className="text-sm text-destructive">{state.error}</p>}{state.saved&&<p role="status" className="text-sm text-primary">Contractor saved. Available in the cleaner selector; no app access or invitation was created.</p>}</form>;
}
export function InviteContractorForm({person}:{person:TeamMemberRecord}) {
 const [state,action,pending]=useActionState(keepValuesOnError(inviteTeamMemberAction),{error:null});
 return <form action={action} className="space-y-3"><input type="hidden" name="contractorId" value={person.id}/><input type="hidden" name="role" value="cleaner"/><input type="hidden" name="full_name" value={person.full_name}/>
 <p className="text-sm text-muted-foreground">Invite this contractor to the cleaner portal. Their existing jobs and payments will stay attached to them.</p>
 <label className="block text-sm">Email for app access<input name="email" type="email" defaultValue={state.submitted?.email??person.email??''} required className="mt-1 min-h-12 w-full rounded-xl border border-input bg-background px-3 text-base"/></label>
 <button disabled={pending} className="min-h-11 rounded-full border border-border px-5 text-sm font-medium">{pending?'Sending…':'Send app invitation'}</button>{state.error&&<p role="alert" className="text-sm text-destructive">{state.error}</p>}</form>;
}
