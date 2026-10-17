import {dateKeyInTimeZone} from '@/lib/ical/timezone';
/** Suggest completion for a previous local service day, never solely because a job is overdue. Confirmation is still required. */
export function suggestCleaningOperation(job:{status:string;checkout_at:string|null;due_at:string;properties?:{timezone?:string|null}|null},now:Date) {
 const anchor=new Date(job.checkout_at||job.due_at);
 if(!Number.isFinite(anchor.getTime()))return "direct";
 const pastDay=dateKeyInTimeZone(anchor,job.properties?.timezone)<dateKeyInTimeZone(now,job.properties?.timezone);
 return pastDay||['in_progress','completed_pending_review'].includes(job.status)?'complete':'direct';
}
