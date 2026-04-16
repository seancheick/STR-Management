"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { createTemplateAction } from "../actions";

const TEMPLATE_TYPES = ["cleaning", "deep_clean", "inspection", "turnover", "reclean", "other"];

export default function NewTemplatePage() {
  const router = useRouter();
  const [state, action, isPending] = useActionState(createTemplateAction, { error: null });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-10">
      <div>
        <button
          onClick={() => router.back()}
          className="mb-6 text-sm text-muted-foreground hover:text-foreground"
          type="button"
        >
          ← Back
        </button>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Checklists</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">New template</h1>
      </div>

      <form action={action} className="flex flex-col gap-6">
        {state.error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {state.error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="name">
            Template name <span className="text-destructive">*</span>
          </label>
          <input
            className="rounded-2xl border border-border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            id="name"
            name="name"
            placeholder="e.g. 2BR Standard Turnover"
            required
            type="text"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="template_type">
            Type
          </label>
          <select
            className="rounded-2xl border border-border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            id="template_type"
            name="template_type"
          >
            <option value="">— none —</option>
            {TEMPLATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            className="h-4 w-4 accent-primary"
            name="is_default"
            type="checkbox"
            value="true"
          />
          <span className="text-sm">Set as default template for new properties</span>
        </label>

        <button
          className="self-start rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Creating…" : "Create template"}
        </button>
      </form>
    </main>
  );
}
