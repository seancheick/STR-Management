import { describe, it, expect } from "vitest";
import { parseCsv, parseReservationCsv, historyImportSchema, matchStay } from "@/lib/reservations/history";
import { reservationChannel } from "@/lib/reservations/channel";
import seedPayload from "../../supabase/data/booking-1st-floor-2026-05.json";
describe("reservation reference history", () => {
 it("handles quoted commas, newlines and BOM", () => expect(parseCsv('\uFEFFname,note\r\n"Joe, Tanzi","one\ntwo"')).toEqual([["name","note"],["Joe, Tanzi","one\ntwo"]]));
 it("rejects malformed quotes and rows", () => { expect(() => parseCsv('a,b\n"oops')).toThrow(); expect(() => parseCsv('a,b\nx')).toThrow(); });
 it("validates mapped export status and dates", () => {
  const columns={sourceReference:"id",guestName:"guest",checkIn:"in",checkOut:"out",status:"status"};
  expect(parseReservationCsv('id,guest,in,out,status\nx,Joe,2026-05-01,2026-05-03,Past',columns,{Past:"completed"})[0].checkOut).toBe("2026-05-03");
  expect(() => parseReservationCsv('id,guest,in,out,status\nx,Joe,05/01/2026,2026-05-03,Past',columns,{Past:"completed"})).toThrow();
 });
 it("maps a Booking.com reservations export with an explicit column map and reservation numbers as references", () => {
  // Header names are illustrative: Booking.com does not publish its extranet export schema, so callers map real headers explicitly.
  const columns={sourceReference:"Book number",guestName:"Guest name(s)",checkIn:"Check-in",checkOut:"Check-out",status:"Status"};
  const csv='Book number,Booked by,Guest name(s),Check-in,Check-out,Status\n5012345678,"Ruiz, Ana",Ana Ruiz,2026-05-03,2026-05-06,ok\n5012345679,Lee Park,Lee Park,2026-05-25,2026-05-30,cancelled_by_guest';
  const stays=parseReservationCsv(csv,columns,{ok:"completed",cancelled_by_guest:"cancelled"});
  expect(stays).toEqual([{sourceReference:"5012345678",guestName:"Ana Ruiz",checkIn:"2026-05-03",checkOut:"2026-05-06",status:"completed"},{sourceReference:"5012345679",guestName:"Lee Park",checkIn:"2026-05-25",checkOut:"2026-05-30",status:"cancelled"}]);
  expect(parseReservationCsv(csv,columns,{ok:"completed",cancelled_by_guest:"cancelled"})).toEqual(stays);
  expect(() => parseReservationCsv(csv,columns,{ok:"completed"})).toThrow(/row 3/);
  expect(historyImportSchema.safeParse({requestId:"a8000000-0000-4000-8000-000000000030",listingId:"4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a",channel:"booking",stays}).success).toBe(true);
 });
 it("keeps the 1st-floor Booking.com seed unrunnable until the owner fills it, and valid once filled", () => {
  const {_status,_unit,_evidence,...seed}=seedPayload;void _status;void _unit;void _evidence;
  expect(historyImportSchema.safeParse(seed).success).toBe(false);
  const filled={...seed,listingId:"4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a",stays:seed.stays.map((s,i)=>({...s,sourceReference:`50000000${i}`,guestName:`Guest ${i}`}))};
  expect(historyImportSchema.safeParse(filled).success).toBe(true);
  expect(seed.stays.map(s=>[s.checkIn,s.checkOut,s.status])).toEqual([["2026-05-03","2026-05-06","completed"],["2026-05-25","2026-05-30","completed"],["2026-05-30","2026-05-31","completed"],["2026-05-31","2026-06-05","completed"]]);
 });
 it("requires explicit listing and unique channel references", () => expect(historyImportSchema.safeParse({stays:[]}).success).toBe(false));
 it("matches latest checkout within two days and exposes ambiguity", () => {
  const stay={id:"a",listingId:"l",channel:"airbnb",guestName:"Joe",checkIn:"2026-05-01",checkOut:"2026-05-03",status:"completed",source:"channel_history"};
  expect(matchStay([stay],"2026-05-04","l").status).toBe("matched");
  expect(matchStay([stay],"2026-05-06","l").status).toBe("not_found");
  expect(matchStay([stay,{...stay,id:"b"}],"2026-05-03").status).toBe("ambiguous");
  expect(matchStay([{...stay,status:"cancelled"}],"2026-05-03").status).toBe("not_found");
 });
 it("deduplicates explicit CSV and iCal channel identities without hiding conflicting stays", () => {
  const stay={id:"csv",sourceReference:"ABC",listingId:"l",channel:"airbnb",guestName:"Joe",checkIn:"2026-05-01",checkOut:"2026-05-03",status:"completed",source:"channel_history"};
  const live={...stay,id:"ical",sourceReference:"ical:ABC",source:"ical",status:"confirmed"};
  expect(matchStay([live,stay],"2026-05-03").status).toBe("matched");
  expect(matchStay([live,stay],"2026-05-03").stay?.id).toBe("csv");
  expect(matchStay([live,{...stay,sourceReference:"DIFFERENT"}],"2026-05-03").status).toBe("ambiguous");
  expect(matchStay([live,{...stay,checkIn:"2026-04-30"}],"2026-05-03").status).toBe("ambiguous");
  expect(matchStay([live,{...stay,status:"cancelled"}],"2026-05-03").status).toBe("not_found");
 });
 it("prefers one named import over its anonymous iCal mirror with different references",()=>{
  const imported={id:"csv",sourceReference:"CHANNEL-123",listingId:"l",channel:"airbnb",guestName:"Joe Tanzi",checkIn:"2026-05-01",checkOut:"2026-05-03",status:"completed",source:"channel_history"};
  const anonymous={...imported,id:"ical",sourceReference:"ical:opaque-feed-uid",source:"ical",guestName:null,status:"confirmed"};
  for(const stays of [[imported,anonymous],[anonymous,imported]]) {
   const result=matchStay(stays,"2026-05-03");expect(result.status).toBe("matched");expect(result.stay?.id).toBe("csv");expect(result.candidates).toHaveLength(1);
  }
  expect(matchStay([imported,{...anonymous,guestName:"Reserved"}],"2026-05-03").stay?.id).toBe("csv");
  expect(matchStay([imported,{...anonymous,channel:"hostex"}],"2026-05-03").stay?.id).toBe("csv");
  expect(matchStay([imported,{...anonymous,guestName:"Different guest"}],"2026-05-03").status).toBe("ambiguous");
  expect(matchStay([imported,{...anonymous,checkIn:"2026-04-30"}],"2026-05-03").status).toBe("ambiguous");
  expect(matchStay([imported,{...anonymous,channel:"booking"}],"2026-05-03").status).toBe("ambiguous");
  expect(matchStay([imported,{...imported,id:"another",sourceReference:"CHANNEL-456"},anonymous],"2026-05-03").status).toBe("ambiguous");
  expect(matchStay([imported,{...anonymous,listingId:"other"}],"2026-05-03").status).toBe("ambiguous");
 });
 it("keeps provider unknown unless channel evidence is explicit", () => {
  expect(reservationChannel("hostex","Reserved",null)).toBe("hostex");
  expect(reservationChannel("hostex",null,"Channel: Airbnb")).toBe("airbnb");
  expect(reservationChannel("hostex","Airbnb and Booking.com",null)).toBe("hostex");
 });
});
