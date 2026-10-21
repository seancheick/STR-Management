"use client";
import {useRef,useState,useTransition,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {correctCleaningDateAction} from "@/app/actions/cleaning-date";
import {JOBS_CHANGED_EVENT} from "@/lib/services/job-updates";
export function CleaningDateEditor({assignmentId,cleanedOn}:{assignmentId:string;cleanedOn:string|null}){
 const [pending,start]=useTransition();const [message,setMessage]=useState("");const request=useRef<{key:string;id:string}|null>(null);const router=useRouter();
 function submit(event:FormEvent<HTMLFormElement>){
 event.preventDefault();const values=new FormData(event.currentTarget);const cleanedOn=String(values.get("cleanedOn"));const reason=String(values.get("reason")).trim();const key=JSON.stringify({cleanedOn,reason});
 if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};const requestId=request.current.id;
 start(async()=>{try{const result=await correctCleaningDateAction({assignmentId,cleanedOn,reason,requestId});if(result.error){setMessage(result.error);return;}request.current=null;setMessage("Actual cleaning date saved. Checkout and completion evidence are preserved.");router.refresh();window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));}catch{setMessage("Could not confirm the date change. Retry with the same details.");}});
 }
 return <details className="rounded-xl border border-border p-3"><summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Actual cleaning date · {cleanedOn??"Not confirmed"}</summary><p className="my-2 text-sm text-muted-foreground">Record the day the cleaner worked. This keeps the original checkout date and completion confirmation.</p><form onSubmit={submit} className="space-y-3"><fieldset disabled={pending} className="space-y-3"><label className="block text-sm">Day cleaned<input type="date" name="cleanedOn" defaultValue={cleanedOn??""} required className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3" /></label><label className="block text-sm">Reason<input name="reason" minLength={3} maxLength={500} required placeholder="Confirmed against cleaner’s work record" className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3" /></label><button className="min-h-11 rounded-full border border-border px-4 text-sm" type="submit">{pending?"Saving…":"Save cleaning date"}</button></fieldset>{message&&<p role="status" className="text-sm">{message}</p>}</form></details>;
}
