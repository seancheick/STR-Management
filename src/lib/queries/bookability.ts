import "server-only";

import { requireRole } from "@/lib/auth/session";
import { scanIsStale, type DateRange, type PricingAuthority, type Severity } from "@/lib/services/bookability";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type BookabilityFinding = {
  id: string; rule: string; severity: Severity; subject: string; channel_type: string | null;
  start_date: string | null; end_date: string | null; first_seen_at: string; last_seen_at: string;
  property_title: string | null;
  detail: { problem: string; cause: string; action: string; days?: number; ranges?: DateRange[]; priceReadonly?: boolean };
};
export type ChannelListing = {
  id: string; property_title: string; channel_type: string; listing_id: string; currency: string;
  listing_title: string | null; price_readonly: boolean | null; hostex_ratio: number | null;
  pricing_authority: PricingAuthority; intentionally_closed: boolean; expected_ratio: number | null;
  prices_changed_at: string | null; last_verified_at: string | null;
};
export type BookabilityReport = {
  findings: BookabilityFinding[];
  listings: ChannelListing[];
  lastScan: { started_at: string; result: string | null; error: string | null } | null;
  lastSuccessAt: string | null;
  stale: boolean;
};

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

/** Open findings and channel settings for this workspace; RLS limits it to owners and admins. */
export async function getBookabilityReport(): Promise<BookabilityReport> {
  await requireRole(["owner", "admin"]);
  const supabase = await createServerSupabaseClient();
  const [findings, listings, last, success] = await Promise.all([
    supabase.from("bookability_findings").select("id, rule, severity, subject, channel_type, start_date, end_date, first_seen_at, last_seen_at, detail").is("resolved_at", null),
    supabase.from("channel_listings").select("id, property_title, channel_type, listing_id, currency, listing_title, price_readonly, hostex_ratio, pricing_authority, intentionally_closed, expected_ratio, prices_changed_at, last_verified_at").order("property_title").order("channel_type").order("listing_id"),
    supabase.from("bookability_scans").select("started_at, result, error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("bookability_scans").select("finished_at").eq("result", "success").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const res of [findings, listings, last, success]) if (res.error) throw new Error(res.error.message);
  const rows = (listings.data ?? []).map((l) => ({ ...l, expected_ratio: l.expected_ratio === null ? null : Number(l.expected_ratio) })) as ChannelListing[];
  const titleOf = new Map(rows.map((l) => [`${l.channel_type}:${l.listing_id}`, l.property_title]));
  const lastSuccessAt = (success.data?.finished_at as string | undefined) ?? null;
  return {
    findings: ((findings.data ?? []) as Omit<BookabilityFinding, "property_title">[])
      .map((f) => ({ ...f, property_title: titleOf.get(`${f.channel_type}:${f.subject}`) ?? null }))
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.property_title ?? "").localeCompare(b.property_title ?? "")),
    listings: rows,
    lastScan: last.data ?? null,
    lastSuccessAt,
    stale: rows.length > 0 && scanIsStale(lastSuccessAt, new Date()),
  };
}

/** Banner check for the admin layout. Never throws: a broken banner must not take the dashboard down. */
export async function getBookabilityAlert(): Promise<{ critical: number; stale: boolean }> {
  try {
    const supabase = await createServerSupabaseClient();
    const [critical, configured, success] = await Promise.all([
      supabase.from("bookability_findings").select("id", { count: "exact", head: true }).is("resolved_at", null).eq("severity", "critical"),
      supabase.from("channel_listings").select("id", { count: "exact", head: true }),
      supabase.from("bookability_scans").select("finished_at").eq("result", "success").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return { critical: critical.count ?? 0, stale: (configured.count ?? 0) > 0 && scanIsStale((success.data?.finished_at as string | undefined) ?? null, new Date()) };
  } catch (error) {
    console.error("[bookability-alert]", error);
    return { critical: 0, stale: false };
  }
}
