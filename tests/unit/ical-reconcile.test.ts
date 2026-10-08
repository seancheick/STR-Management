import { describe, expect, it } from "vitest";

import type { TurnoverCandidate } from "@/lib/ical/parser";
import { planReconciliation, type ImportedAssignment } from "@/lib/ical/reconcile";

const SOURCE = "11111111-1111-1111-1111-111111111111";
const OTHER_SOURCE = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-10-08T12:00:00Z");

function candidate(uid: string, checkout: string, due: string, next: string | null = null): TurnoverCandidate {
  return {
    uid,
    checkinAt: "2026-10-15T19:00:00.000Z",
    checkoutAt: checkout,
    dueAt: due,
    nextCheckinAt: next,
    summary: "Reserved",
    description: null,
  } as TurnoverCandidate;
}

function row(overrides: Partial<ImportedAssignment> = {}): ImportedAssignment {
  return {
    id: "a1",
    source_reference: "ical:booking-1",
    status: "assigned",
    cleaner_id: "cleaner-1",
    calendar_source_id: SOURCE,
    // Supabase returns +00:00 offsets; the feed gives Z. Same instant.
    due_at: "2026-10-19T19:00:00+00:00",
    checkout_at: "2026-10-19T15:00:00+00:00",
    next_checkin_at: null,
    ...overrides,
  };
}

const unchanged = candidate("booking-1", "2026-10-19T15:00:00.000Z", "2026-10-19T19:00:00.000Z");

describe("planReconciliation", () => {
  it("does nothing when the feed still has the booking with the same dates", () => {
    const plan = planReconciliation({ existing: [row()], candidates: [unchanged], calendarSourceId: SOURCE, now: NOW });
    expect(plan).toEqual({ updates: [], stampSourceIds: [], cancels: [] });
  });

  it("moves the job when the checkout date changes, and flags it for the cleaner", () => {
    const moved = candidate("booking-1", "2026-10-21T15:00:00.000Z", "2026-10-21T19:00:00.000Z");
    const plan = planReconciliation({ existing: [row()], candidates: [moved], calendarSourceId: SOURCE, now: NOW });
    expect(plan.updates).toEqual([
      {
        id: "a1",
        cleanerId: "cleaner-1",
        dueChanged: true,
        previousDueAt: "2026-10-19T19:00:00+00:00",
        patch: {
          due_at: "2026-10-21T19:00:00.000Z",
          checkout_at: "2026-10-21T15:00:00.000Z",
          next_checkin_at: null,
        },
      },
    ]);
    expect(plan.cancels).toEqual([]);
  });

  it("updates next check-in silently when only the following booking changed", () => {
    const next = candidate("booking-1", "2026-10-19T15:00:00.000Z", "2026-10-19T19:00:00.000Z", "2026-10-20T19:00:00.000Z");
    const plan = planReconciliation({ existing: [row()], candidates: [next], calendarSourceId: SOURCE, now: NOW });
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].dueChanged).toBe(false);
  });

  it("cancels an upcoming job whose booking left this source's feed", () => {
    const plan = planReconciliation({ existing: [row()], candidates: [], calendarSourceId: SOURCE, now: NOW });
    expect(plan.cancels).toEqual([{ id: "a1", cleanerId: "cleaner-1", dueAt: "2026-10-19T19:00:00+00:00" }]);
  });

  it("never cancels a job created by a different feed on the same property", () => {
    const plan = planReconciliation({
      existing: [row({ calendar_source_id: OTHER_SOURCE })],
      candidates: [],
      calendarSourceId: SOURCE,
      now: NOW,
    });
    expect(plan.cancels).toEqual([]);
  });

  it("never cancels a job whose source is unknown", () => {
    const plan = planReconciliation({
      existing: [row({ calendar_source_id: null })],
      candidates: [],
      calendarSourceId: SOURCE,
      now: NOW,
    });
    expect(plan.cancels).toEqual([]);
  });

  it("stamps the source on an unlinked job this feed still contains", () => {
    const plan = planReconciliation({
      existing: [row({ calendar_source_id: null })],
      candidates: [unchanged],
      calendarSourceId: SOURCE,
      now: NOW,
    });
    expect(plan.stampSourceIds).toEqual(["a1"]);
  });

  it("leaves past jobs alone even if they left the feed", () => {
    const plan = planReconciliation({
      existing: [row({ due_at: "2026-10-01T19:00:00+00:00" })],
      candidates: [],
      calendarSourceId: SOURCE,
      now: NOW,
    });
    expect(plan.cancels).toEqual([]);
  });

  it.each(["in_progress", "completed_pending_review", "approved", "needs_reclean", "cancelled"])(
    "leaves a %s job alone",
    (status) => {
      const moved = candidate("booking-1", "2026-10-21T15:00:00.000Z", "2026-10-21T19:00:00.000Z");
      for (const candidates of [[moved], []]) {
        const plan = planReconciliation({ existing: [row({ status })], candidates, calendarSourceId: SOURCE, now: NOW });
        expect(plan).toEqual({ updates: [], stampSourceIds: [], cancels: [] });
      }
    },
  );
});
