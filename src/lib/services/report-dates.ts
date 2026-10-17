import {dateKeyInTimeZone,formatInTimeZone} from "@/lib/ical/timezone";
/** Calendar dates have no timezone; timestamps are shown in the property zone. */
export function formatReportDate(value:string,options:Intl.DateTimeFormatOptions={month:"short",day:"numeric",year:"numeric"},timezone?:string|null) {
 return /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? formatInTimeZone(`${value}T12:00:00Z`,options,"UTC")
  : formatInTimeZone(value,options,timezone);
}
export function isJobInReportPeriod(dueAt:string,start:string,end:string,timezone?:string|null) {
 const localDate=dateKeyInTimeZone(new Date(dueAt),timezone);
 return localDate>=start&&localDate<=end;
}
