import { updateChannelListingAction } from "@/app/(admin)/dashboard/health/actions";
import { ScanBookabilityButton } from "@/app/(admin)/dashboard/health/scan-button";
import type { BookabilityReport } from "@/lib/queries/bookability";
import { healthTimeAgo } from "@/lib/services/system-health";

const SEVERITY = {
  critical: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-border bg-muted text-muted-foreground",
} as const;

function dateLabel(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function BookabilitySection({ report, now }: { report: BookabilityReport; now: number }) {
  const { findings, listings, lastScan } = report;
  return (
    <section id="bookability" className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Bookability</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Read-only scan of every Hostex channel calendar, 180 days ahead. Last successful scan: {healthTimeAgo(report.lastSuccessAt, now)}
            {lastScan?.result === "failed" && <span className="text-destructive"> · Latest scan failed: {lastScan.error}</span>}
          </p>
        </div>
        <ScanBookabilityButton />
      </div>

      {report.stale && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">No successful scan in the last 26 hours. Problems may be going unnoticed.</p>}

      {!listings.length ? <p className="mt-3 text-sm text-muted-foreground">No scan has run yet. Run a scan to load your channel calendars.</p>
        : !findings.length ? <p className="mt-3 text-sm text-muted-foreground">All {listings.length} channel calendars are bookable on every open date checked.</p>
        : <ul className="mt-3 divide-y divide-border/60">{findings.map((f) => (
          <li key={f.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{f.detail.problem}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {f.property_title ?? (f.channel_type ? "Unmapped listing" : "Workspace")}{f.channel_type && ` · ${f.channel_type} · ${f.subject}`}
                {f.start_date && f.end_date && ` · ${dateLabel(f.start_date)} – ${dateLabel(f.end_date)}`}{f.detail.days ? ` · ${f.detail.days} nights` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Probable cause: {f.detail.cause}. Next step: {f.detail.action}.</p>
              <p className="mt-1 text-xs text-muted-foreground">First seen {healthTimeAgo(f.first_seen_at, now)} · still present at last check {healthTimeAgo(f.last_seen_at, now)}</p>
            </div>
            <span className={`inline-flex shrink-0 self-start rounded-full border px-3 py-1 text-xs font-medium capitalize ${SEVERITY[f.severity]}`}>{f.severity}</span>
          </li>
        ))}</ul>}

      {listings.length > 0 && <details className="mt-4 rounded-xl border border-border/60 p-4">
        <summary className="cursor-pointer text-sm font-medium">Pricing authority · {listings.length} channel calendars</summary>
        <p className="mt-2 text-xs text-muted-foreground">Only one system may publish rates to a calendar. Mark a calendar intentionally closed to stop inventory alerts. Expected ratio is the plan&apos;s price relative to Airbnb (for example 0.77); leave it blank to compare against its usual ratio.</p>
        <ul className="mt-3 divide-y divide-border/60">{listings.map((l) => (
          <li key={l.id} className="py-3">
            <form action={updateChannelListingAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="channelType" value={l.channel_type} /><input type="hidden" name="listingId" value={l.listing_id} />
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{l.property_title} <span className="font-normal text-muted-foreground">· {l.channel_type}</span></p>
                <p className="text-xs text-muted-foreground">{l.listing_title ?? l.listing_id} · {l.listing_id}{l.price_readonly ? ` · priced by ${l.channel_type}` : l.hostex_ratio ? ` · ${l.hostex_ratio}% of base` : ""} · prices last changed {healthTimeAgo(l.prices_changed_at, now)}</p>
              </div>
              <select name="pricingAuthority" defaultValue={l.pricing_authority} aria-label="Pricing authority" className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
                <option value="manual">Manual</option><option value="pricelabs">PriceLabs</option><option value="turnflow">TurnFlow</option>
              </select>
              <input name="expectedRatio" defaultValue={l.expected_ratio ?? ""} inputMode="decimal" placeholder="Ratio" aria-label="Expected ratio to Airbnb" className="h-10 w-20 rounded-xl border border-input bg-background px-3 text-sm" />
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="intentionallyClosed" defaultChecked={l.intentionally_closed} />Closed on purpose</label>
              <button type="submit" className="h-10 rounded-full border border-border/70 px-4 text-sm font-medium hover:bg-muted">Save</button>
            </form>
          </li>
        ))}</ul>
      </details>}
    </section>
  );
}
