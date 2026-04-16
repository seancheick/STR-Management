import { describe, expect, it } from "vitest";

// ─── SLA window calculations ──────────────────────────────────────────────────

function isDueSoon(dueAt: string, withinHours: number, now: Date = new Date()): boolean {
  const due = new Date(dueAt);
  const diff = due.getTime() - now.getTime();
  return diff >= 0 && diff <= withinHours * 60 * 60 * 1000;
}

function isOverdue(dueAt: string, now: Date = new Date()): boolean {
  return new Date(dueAt) < now;
}

function isSLABreach(
  dueAt: string,
  status: string,
  cleanerId: string | null,
  now: Date = new Date(),
): boolean {
  if (status !== "unassigned") return false;
  if (cleanerId !== null) return false;
  return isDueSoon(dueAt, 2, now);
}

describe("SLA window: isDueSoon", () => {
  const now = new Date("2026-05-10T10:00:00Z");

  it("flags job due in 1 hour as due within 2h", () => {
    expect(isDueSoon("2026-05-10T11:00:00Z", 2, now)).toBe(true);
  });

  it("flags job due in exactly 2 hours", () => {
    expect(isDueSoon("2026-05-10T12:00:00Z", 2, now)).toBe(true);
  });

  it("does not flag job due in 3 hours as within 2h", () => {
    expect(isDueSoon("2026-05-10T13:00:00Z", 2, now)).toBe(false);
  });

  it("does not flag already overdue job as due soon", () => {
    expect(isDueSoon("2026-05-10T09:00:00Z", 2, now)).toBe(false);
  });

  it("flags job due in 23h as within 24h window", () => {
    expect(isDueSoon("2026-05-11T09:00:00Z", 24, now)).toBe(true);
  });

  it("does not flag job due in 25h as within 24h window", () => {
    expect(isDueSoon("2026-05-11T11:00:00Z", 24, now)).toBe(false);
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-05-10T10:00:00Z");

  it("flags job past due", () => {
    expect(isOverdue("2026-05-10T09:00:00Z", now)).toBe(true);
  });

  it("does not flag future job", () => {
    expect(isOverdue("2026-05-10T11:00:00Z", now)).toBe(false);
  });

  it("flags job due 1 second ago as overdue", () => {
    expect(isOverdue("2026-05-10T09:59:59Z", now)).toBe(true);
  });
});

describe("isSLABreach", () => {
  const now = new Date("2026-05-10T10:00:00Z");

  it("flags unassigned job due in 1h with no cleaner", () => {
    expect(isSLABreach("2026-05-10T11:00:00Z", "unassigned", null, now)).toBe(true);
  });

  it("does not flag assigned job due in 1h", () => {
    expect(isSLABreach("2026-05-10T11:00:00Z", "assigned", "cleaner-id", now)).toBe(false);
  });

  it("does not flag unassigned job due in 5h", () => {
    expect(isSLABreach("2026-05-10T15:00:00Z", "unassigned", null, now)).toBe(false);
  });

  it("does not flag completed job", () => {
    expect(isSLABreach("2026-05-10T11:00:00Z", "completed_pending_review", null, now)).toBe(false);
  });
});

// ─── Notification dedup: same type within window ──────────────────────────────

type NotifRecord = { notification_type: string; assignment_id: string; created_at: string };

function alreadySentWithinHours(
  existing: NotifRecord[],
  type: string,
  assignmentId: string,
  withinHours: number,
  now: Date = new Date(),
): boolean {
  const cutoff = now.getTime() - withinHours * 60 * 60 * 1000;
  return existing.some(
    (n) =>
      n.notification_type === type &&
      n.assignment_id === assignmentId &&
      new Date(n.created_at).getTime() >= cutoff,
  );
}

describe("notification dedup", () => {
  const now = new Date("2026-05-10T12:00:00Z");

  it("detects duplicate within window", () => {
    const existing: NotifRecord[] = [
      {
        notification_type: "reminder_24h",
        assignment_id: "assign-1",
        created_at: "2026-05-10T11:00:00Z",
      },
    ];
    expect(alreadySentWithinHours(existing, "reminder_24h", "assign-1", 6, now)).toBe(true);
  });

  it("does not deduplicate stale record outside window", () => {
    const existing: NotifRecord[] = [
      {
        notification_type: "reminder_24h",
        assignment_id: "assign-1",
        created_at: "2026-05-10T05:00:00Z",
      },
    ];
    expect(alreadySentWithinHours(existing, "reminder_24h", "assign-1", 6, now)).toBe(false);
  });

  it("does not deduplicate different assignment", () => {
    const existing: NotifRecord[] = [
      {
        notification_type: "reminder_24h",
        assignment_id: "assign-2",
        created_at: "2026-05-10T11:30:00Z",
      },
    ];
    expect(alreadySentWithinHours(existing, "reminder_24h", "assign-1", 6, now)).toBe(false);
  });

  it("does not deduplicate different type", () => {
    const existing: NotifRecord[] = [
      {
        notification_type: "reminder_2h",
        assignment_id: "assign-1",
        created_at: "2026-05-10T11:30:00Z",
      },
    ];
    expect(alreadySentWithinHours(existing, "reminder_24h", "assign-1", 6, now)).toBe(false);
  });
});
