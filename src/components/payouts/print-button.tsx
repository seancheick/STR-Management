"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90"
      onClick={() => window.print()}
      type="button"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
      Print / save as PDF
    </button>
  );
}
