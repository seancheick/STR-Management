import { z } from "zod/v4";

export const historicalStaySchema = z.object({
  sourceReference: z.string().trim().min(1).max(200),
  guestName: z.string().trim().min(1).max(200),
  checkIn: z.iso.date(), checkOut: z.iso.date(),
  status: z.enum(["confirmed", "completed", "cancelled", "no_show"]),
}).refine(r => r.checkOut > r.checkIn, "Checkout must follow check-in.");
export const historyImportSchema = z.object({
  requestId: z.guid(), listingId: z.guid(), channel: z.enum(["airbnb", "booking", "vrbo", "other"]),
  stays: z.array(historicalStaySchema).min(1).max(5000),
}).refine(v => new Set(v.stays.map(s => s.sourceReference)).size === v.stays.length, "Duplicate reservation references in import.");

/** RFC4180 CSV, including escaped quotes and embedded newlines. Reject malformed input. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false; let closed = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ""; closed = false;
      if (c !== ',') { if (c === '\r' && input[i + 1] === '\n') i++; if (row.some(v => v.length)) rows.push(row); row = []; }
    } else if (c === '"' && !field && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error("Malformed CSV quoting."); field += c; }
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  row.push(field); if (row.some(v => v.length)) rows.push(row);
  if (!rows.length || rows.some(r => r.length !== rows[0].length)) throw new Error("CSV rows must have consistent columns.");
  return rows;
}

/** Explicit column mapping avoids guessing the meaning of channel-specific exports. Dates must be ISO. */
export function parseReservationCsv(csv: string, columns: { sourceReference: string; guestName: string; checkIn: string; checkOut: string; status: string }, statusMap: Record<string, "confirmed" | "completed" | "cancelled" | "no_show">) {
  if (csv.length > 5_000_000) throw new Error("CSV exceeds 5 MB.");
  const [headers, ...rows] = parseCsv(csv);
  if (new Set(headers).size !== headers.length) throw new Error("Duplicate CSV headers.");
  const indexes = Object.fromEntries(Object.entries(columns).map(([key, name]) => {
    const index = headers.indexOf(name); if (index < 0) throw new Error(`Missing CSV column: ${name}`); return [key, index];
  })) as Record<keyof typeof columns, number>;
  return rows.map((r, i) => {
    const raw = Object.fromEntries(Object.entries(indexes).map(([key, index]) => [key, r[index].trim()]));
    const parsed = historicalStaySchema.safeParse({ ...raw, status: statusMap[raw.status] });
    if (!parsed.success) throw new Error(`CSV row ${i + 2}: ${parsed.error.issues[0].message}`);
    return parsed.data;
  });
}

export type ReferenceStay = { id: string; listingId: string; channel: string; guestName: string | null; checkIn: string; checkOut: string; status: string; source: string; sourceReference?: string | null };
export function matchStay(stays: ReferenceStay[], cleaningDate: string, listingId?: string | null) {
  const start = new Date(`${cleaningDate}T00:00:00Z`).getTime() - 2 * 86400000;
  // The same channel reservation can be present in both a CSV and iCal.
  // Deduplicate only explicit channel identities with agreeing dates. Differing
  // dates or references remain visible as conflicting evidence.
  const unique = new Map<string, ReferenceStay>();
  for (const stay of stays) {
    const reference = stay.sourceReference?.trim().replace(/^ical:/, "");
    const key = reference
      ? JSON.stringify([stay.listingId, stay.channel, reference, stay.checkIn, stay.checkOut])
      : JSON.stringify([stay.source, stay.id]);
    const prior = unique.get(key);
    if (!prior || stay.source === "channel_history") unique.set(key, stay);
  }
  // Opaque feed UIDs often differ from channel confirmation numbers. Collapse
  // only a one-to-one anonymous mirror with identical listing and stay dates.
  // Named records, competing imports and conflicting channels stay ambiguous.
  const groups = new Map<string, ReferenceStay[]>();
  for (const stay of unique.values()) {
    const key = JSON.stringify([stay.listingId, stay.checkIn, stay.checkOut]);
    groups.set(key, [...(groups.get(key) ?? []), stay]);
  }
  const mirrors = new Set<ReferenceStay>();
  for (const group of groups.values()) {
    if (group.length !== 2) continue;
    const imported = group.find(s => s.source === "channel_history" && s.guestName?.trim() && ["confirmed", "completed"].includes(s.status));
    const anonymous = group.find(s => s.source === "ical" && !s.guestName?.trim());
    if (imported && anonymous && (anonymous.channel === imported.channel || ["hostex", "other"].includes(anonymous.channel))) mirrors.add(anonymous);
  }
  const candidates = [...unique.values()].filter(s => !mirrors.has(s)).filter(s => (!listingId || s.listingId === listingId) && !["cancelled", "no_show"].includes(s.status) && s.checkOut <= cleaningDate && new Date(`${s.checkOut}T00:00:00Z`).getTime() >= start);
  const latest = candidates.map(s => s.checkOut).sort().at(-1);
  const matches = candidates.filter(s => s.checkOut === latest);
  return { status: matches.length === 1 ? "matched" : matches.length ? "ambiguous" : "not_found", stay: matches.length === 1 ? matches[0] : null, candidates: matches };
}
