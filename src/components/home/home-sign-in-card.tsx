"use client";

import { Building2, Sparkles } from "lucide-react";
import { useState } from "react";

import { SignInForm } from "@/components/auth/sign-in-form";

type Tab = "owner" | "cleaner";

export function HomeSignInCard() {
  const [tab, setTab] = useState<Tab>("owner");

  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-card p-6 shadow-xl ring-1 ring-black/5 sm:p-7">
      <div className="mb-5 space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
          Access your dashboard
        </p>
        <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-full border border-border/70 bg-muted/50 p-1">
        <button
          aria-pressed={tab === "owner"}
          className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition ${
            tab === "owner"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("owner")}
          type="button"
        >
          <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
          Owner / Admin
        </button>
        <button
          aria-pressed={tab === "cleaner"}
          className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition ${
            tab === "cleaner"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("cleaner")}
          type="button"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Cleaner
        </button>
      </div>

      {/* Same SignInForm, just a different post-login landing. Cleaner tab uses
          /jobs; owner tab uses /dashboard (default). */}
      <SignInForm
        key={tab}
        redirectTo={tab === "cleaner" ? "/jobs" : "/dashboard"}
      />
    </div>
  );
}
