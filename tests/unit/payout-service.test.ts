import { describe, expect, it } from "vitest";

// ─── groupEntriesByClean (pure function — importable without server-only) ─────

type EntryLike = {
  id: string;
  batch_id: string;
  owner_id: string;
  cleaner_id: string;
  assignment_id: string;
  property_id: string;
  amount: number;
  status: "included" | "excluded" | "disputed";
  notes: string | null;
  created_at: string;
  cleaners?: { full_name: string } | null;
  properties?: { name: string } | null;
  assignments?: {
    due_at: string;
    assignment_type: string;
    expected_duration_min: number | null;
  } | null;
};

function groupEntriesByClean(
  entries: EntryLike[],
): { cleaner_id: string; cleaner_name: string; entries: EntryLike[]; subtotal: number }[] {
  const map = new Map<string, { cleaner_id: string; cleaner_name: string; entries: EntryLike[]; subtotal: number }>();
  for (const e of entries) {
    if (e.status !== "included") continue;
    const key = e.cleaner_id;
    if (!map.has(key)) {
      map.set(key, {
        cleaner_id: key,
        cleaner_name: e.cleaners?.full_name ?? "Unknown",
        entries: [],
        subtotal: 0,
      });
    }
    const stmt = map.get(key)!;
    stmt.entries.push(e);
    stmt.subtotal += Number(e.amount);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.cleaner_name.localeCompare(b.cleaner_name),
  );
}

function makeEntry(
  override: Partial<EntryLike> & { cleaner_id: string },
): EntryLike {
  return {
    id: Math.random().toString(36).slice(2),
    batch_id: "batch-1",
    owner_id: "owner-1",
    assignment_id: Math.random().toString(36).slice(2),
    property_id: "prop-1",
    amount: 100,
    status: "included",
    notes: null,
    created_at: "2026-04-01T00:00:00Z",
    cleaners: { full_name: "Alice" },
    properties: { name: "Unit A" },
    assignments: {
      due_at: "2026-04-01T14:00:00Z",
      assignment_type: "turnover",
      expected_duration_min: 90,
    },
    ...override,
  };
}

describe("groupEntriesByClean", () => {
  it("groups entries by cleaner_id", () => {
    const entries = [
      makeEntry({ cleaner_id: "c1", cleaners: { full_name: "Alice" }, amount: 80 }),
      makeEntry({ cleaner_id: "c2", cleaners: { full_name: "Bob" }, amount: 60 }),
      makeEntry({ cleaner_id: "c1", cleaners: { full_name: "Alice" }, amount: 90 }),
    ];
    const groups = groupEntriesByClean(entries);
    expect(groups).toHaveLength(2);
    const alice = groups.find((g) => g.cleaner_id === "c1")!;
    expect(alice.entries).toHaveLength(2);
    expect(alice.subtotal).toBe(170);
  });

  it("excludes entries with status !== included", () => {
    const entries = [
      makeEntry({ cleaner_id: "c1", amount: 100 }),
      makeEntry({ cleaner_id: "c1", status: "excluded", amount: 50 }),
      makeEntry({ cleaner_id: "c1", status: "disputed", amount: 30 }),
    ];
    const groups = groupEntriesByClean(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].subtotal).toBe(100);
    expect(groups[0].entries).toHaveLength(1);
  });

  it("sorts groups alphabetically by cleaner name", () => {
    const entries = [
      makeEntry({ cleaner_id: "c3", cleaners: { full_name: "Zara" }, amount: 10 }),
      makeEntry({ cleaner_id: "c1", cleaners: { full_name: "Alice" }, amount: 10 }),
      makeEntry({ cleaner_id: "c2", cleaners: { full_name: "Marcus" }, amount: 10 }),
    ];
    const groups = groupEntriesByClean(entries);
    expect(groups.map((g) => g.cleaner_name)).toEqual(["Alice", "Marcus", "Zara"]);
  });

  it("returns empty array for empty input", () => {
    expect(groupEntriesByClean([])).toEqual([]);
  });

  it("handles missing cleaner name gracefully", () => {
    const entries = [
      makeEntry({ cleaner_id: "c1", cleaners: null }),
    ];
    const groups = groupEntriesByClean(entries);
    expect(groups[0].cleaner_name).toBe("Unknown");
  });

  it("accumulates subtotal correctly with decimal amounts", () => {
    const entries = [
      makeEntry({ cleaner_id: "c1", amount: 75.5 }),
      makeEntry({ cleaner_id: "c1", amount: 24.5 }),
    ];
    const groups = groupEntriesByClean(entries);
    expect(groups[0].subtotal).toBeCloseTo(100);
  });
});

// ─── Batch status transitions ─────────────────────────────────────────────────

type BatchStatus = "draft" | "approved" | "paid" | "cancelled";

function canApprove(status: BatchStatus): boolean {
  return status === "draft";
}

function canPay(status: BatchStatus): boolean {
  return status === "approved";
}

function canCancel(status: BatchStatus): boolean {
  return status === "draft" || status === "approved";
}

describe("batch status guards", () => {
  it("only draft batches can be approved", () => {
    expect(canApprove("draft")).toBe(true);
    expect(canApprove("approved")).toBe(false);
    expect(canApprove("paid")).toBe(false);
    expect(canApprove("cancelled")).toBe(false);
  });

  it("only approved batches can be marked paid", () => {
    expect(canPay("approved")).toBe(true);
    expect(canPay("draft")).toBe(false);
    expect(canPay("paid")).toBe(false);
    expect(canPay("cancelled")).toBe(false);
  });

  it("draft and approved batches can be cancelled", () => {
    expect(canCancel("draft")).toBe(true);
    expect(canCancel("approved")).toBe(true);
    expect(canCancel("paid")).toBe(false);
    expect(canCancel("cancelled")).toBe(false);
  });
});

// ─── CSV generation logic ─────────────────────────────────────────────────────

function buildCsvRows(entries: EntryLike[]): string[] {
  const rows: string[] = [
    ["Cleaner", "Property", "Date", "Type", "Amount", "Status", "Notes"].join(","),
  ];
  for (const e of entries) {
    const cleanerName = e.cleaners?.full_name ?? "";
    const propertyName = e.properties?.name ?? "";
    const date = e.assignments?.due_at
      ? new Date(e.assignments.due_at).toISOString().slice(0, 10)
      : "";
    const type = e.assignments?.assignment_type ?? "";
    const amount = Number(e.amount).toFixed(2);
    const notes = (e.notes ?? "").replace(/"/g, '""');
    rows.push(
      [`"${cleanerName}"`, `"${propertyName}"`, date, type, amount, e.status, `"${notes}"`].join(","),
    );
  }
  return rows;
}

describe("CSV generation", () => {
  it("produces header row", () => {
    const rows = buildCsvRows([]);
    expect(rows[0]).toBe("Cleaner,Property,Date,Type,Amount,Status,Notes");
  });

  it("formats amounts to 2 decimal places", () => {
    const entry = makeEntry({ cleaner_id: "c1", amount: 75 });
    const rows = buildCsvRows([entry]);
    expect(rows[1]).toContain("75.00");
  });

  it("escapes double quotes in notes", () => {
    const entry = makeEntry({ cleaner_id: "c1", notes: 'Has "quotes"' });
    const rows = buildCsvRows([entry]);
    expect(rows[1]).toContain('Has ""quotes""');
  });

  it("formats ISO date correctly", () => {
    const entry = makeEntry({ cleaner_id: "c1" });
    const rows = buildCsvRows([entry]);
    expect(rows[1]).toContain("2026-04-01");
  });
});

// ─── Period filter logic ──────────────────────────────────────────────────────

function isInPeriod(dueAt: string, periodStart: string, periodEnd: string): boolean {
  const due = new Date(dueAt).getTime();
  const start = new Date(`${periodStart}T00:00:00Z`).getTime();
  const end = new Date(`${periodEnd}T23:59:59Z`).getTime();
  return due >= start && due <= end;
}

describe("period filter", () => {
  it("includes assignment due within period", () => {
    expect(isInPeriod("2026-04-15T10:00:00Z", "2026-04-01", "2026-04-30")).toBe(true);
  });

  it("includes assignment due on start date", () => {
    expect(isInPeriod("2026-04-01T00:00:00Z", "2026-04-01", "2026-04-30")).toBe(true);
  });

  it("includes assignment due on end date", () => {
    expect(isInPeriod("2026-04-30T23:59:59Z", "2026-04-01", "2026-04-30")).toBe(true);
  });

  it("excludes assignment before period", () => {
    expect(isInPeriod("2026-03-31T23:59:59Z", "2026-04-01", "2026-04-30")).toBe(false);
  });

  it("excludes assignment after period", () => {
    expect(isInPeriod("2026-05-01T00:00:00Z", "2026-04-01", "2026-04-30")).toBe(false);
  });
});
