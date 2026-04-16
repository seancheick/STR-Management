"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { PRESET_TEMPLATES } from "@/lib/data/preset-templates";
import { clonePresetAction } from "@/app/(admin)/dashboard/templates/actions";

export function PresetCards() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClone(presetKey: string) {
    setLoadingKey(presetKey);
    setError(null);
    startTransition(async () => {
      const result = await clonePresetAction(presetKey);
      if (result.error) {
        setError(result.error);
        setLoadingKey(null);
      } else if (result.id) {
        router.push(`/dashboard/templates/${result.id}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Start from a preset</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          built-in
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Clone a preset to create your own customizable template.
      </p>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {PRESET_TEMPLATES.map((preset) => (
          <div
            key={preset.key}
            className="flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-card p-5"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{preset.name}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground capitalize">
                  {preset.template_type.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{preset.description}</p>
              <p className="text-xs text-muted-foreground">{preset.items.length} items</p>
            </div>
            <button
              className="self-start rounded-full border border-primary/40 px-4 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/5 disabled:opacity-60"
              disabled={isPending}
              onClick={() => handleClone(preset.key)}
              type="button"
            >
              {loadingKey === preset.key ? "Cloning…" : "Clone & customize"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
