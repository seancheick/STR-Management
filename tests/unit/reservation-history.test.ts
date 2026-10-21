import { describe, it, expect } from "vitest";
import { parseCsv, parseReservationCsv, historyImportSchema, matchStay } from "@/lib/reservations/history";
import { reservationChannel } from "@/lib/reservations/channel";
describe("reservation reference history", () => {
 it("handles quoted commas, newlines and BOM", () => expect(parseCsv('\uFEFFname,note\r\n"Joe, Tanzi","one\ntwo"')).toEqual([["name","note"],["Joe, Tanzi","one\ntwo"]]));
 it("rejects malformed quotes and rows", () => { expect(() => parseCsv('a,b\n"oops')).toThrow(); expect(() => parseCsv('a,b\nx')).toThrow(); });
 it("validates mapped export status and dates", () => {
  const columns={sourceReference:"id",guestName:"guest",checkIn:"in",checkOut:"out",status:"status"};
  expect(parseReservationCsv('id,guest,in,out,status\nx,Joe,2026-05-01,2026-05-03,Past',columns,{Past:"completed"})[0].checkOut).toBe("2026-05-03");
  expect(() => parseReservationCsv('id,guest,in,out,status\nx,Joe,05/01/2026,2026-05-03,Past',columns,{Past:"completed"})).toThrow();
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
 it("keeps provider unknown unless channel evidence is explicit", () => {
  expect(reservationChannel("hostex","Reserved",null)).toBe("hostex");
  expect(reservationChannel("hostex",null,"Channel: Airbnb")).toBe("airbnb");
  expect(reservationChannel("hostex","Airbnb and Booking.com",null)).toBe("hostex");
 });
});
