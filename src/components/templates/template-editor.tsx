"use client";

import { useTransition, useState, useActionState } from "react";

import type { TemplateRecord, TemplateItemRecord } from "@/lib/queries/templates";
import {
  updateTemplateAction,
  deleteTemplateAction,
  addTemplateItemAction,
  removeTemplateItemAction,
  cloneTemplateAction,
} from "@/app/(admin)/dashboard/templates/actions";

const TEMPLATE_TYPES = ["cleaning", "deep_clean", "inspection", "turnover", "reclean", "other"];

type Props = {
  template: TemplateRecord;
  initialItems: TemplateItemRecord[];
};

export function TemplateEditor({ template, initialItems }: Props) {
  const [isPending, startTransition] = useTransition();
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [addState, addAction, addPending] = useActionState(
    addTemplateItemAction.bind(null, template.id),
    { error: null },
  );

  function handleUpdate(formData: FormData) {
    startTransition(async () => {
      const result = await updateTemplateAction(template.id, formData);
      setUpdateError(result.error);
    });
  }

  function handleDelete() {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteTemplateAction(template.id);
      if (result.error) setDeleteError(result.error);
    });
  }

  function handleClone() {
    startTransition(async () => {
      await cloneTemplateAction(template.id);
    });
  }

  function handleRemoveItem(itemId: string) {
    startTransition(async () => {
      await removeTemplateItemAction(template.id, itemId);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Template metadata edit */}
      <section className="rounded-[1.5rem] border border-border/70 bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Template details</h2>
        <form action={handleUpdate} className="flex flex-col gap-4">
          {updateError && (
            <p className="text-sm text-destructive">{updateError}</p>
          )}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="t-name">Name</label>
            <input
              className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              defaultValue={template.name}
              id="t-name"
              name="name"
              required
              type="text"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="t-type">Type</label>
            <select
              className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              defaultValue={template.template_type ?? ""}
              id="t-type"
              name="template_type"
            >
              <option value="">— none —</option>
              {TEMPLATE_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              className="h-4 w-4 accent-primary"
              defaultChecked={template.is_default}
              name="is_default"
              type="checkbox"
              value="true"
            />
            <span className="text-sm">Default template for new properties</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              disabled={isPending}
              type="submit"
            >
              Save changes
            </button>
            <button
              className="rounded-full border border-border px-5 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
              disabled={isPending}
              onClick={handleClone}
              type="button"
            >
              Clone template
            </button>
            <button
              className="rounded-full border border-destructive/40 px-5 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/5 disabled:opacity-60"
              disabled={isPending}
              onClick={handleDelete}
              type="button"
            >
              Delete
            </button>
          </div>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
        </form>
      </section>

      {/* Items list */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Checklist items</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
            {initialItems.length}
          </span>
        </div>

        {initialItems.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-border bg-card/70 px-6 py-8 text-center text-sm text-muted-foreground">
            No items yet — add your first item below.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {initialItems.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {idx + 1}
                  </span>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{item.label}</p>
                      {item.required && (
                        <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                          required
                        </span>
                      )}
                      {item.photo_category && (
                        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                          photo: {item.photo_category}
                        </span>
                      )}
                    </div>
                    {item.section_name && (
                      <p className="text-xs text-muted-foreground">Section: {item.section_name}</p>
                    )}
                    {item.instruction_text && (
                      <p className="text-xs text-muted-foreground">{item.instruction_text}</p>
                    )}
                    {item.reference_media_url && (
                      <a
                        className="text-xs text-primary underline underline-offset-2"
                        href={item.reference_media_url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Reference image
                      </a>
                    )}
                  </div>
                </div>
                <button
                  className="shrink-0 rounded-full border border-destructive/30 px-3 py-1 text-xs text-destructive transition hover:bg-destructive/5 disabled:opacity-60"
                  disabled={isPending}
                  onClick={() => handleRemoveItem(item.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add item form */}
      <section className="rounded-[1.5rem] border border-border/70 bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Add item</h2>
        <form action={addAction} className="flex flex-col gap-4">
          {addState.error && (
            <p className="text-sm text-destructive">{addState.error}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="label">
                Label <span className="text-destructive">*</span>
              </label>
              <input
                className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                id="label"
                name="label"
                placeholder="e.g. Wipe kitchen counters"
                required
                type="text"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="section_name">Section</label>
              <input
                className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                id="section_name"
                name="section_name"
                placeholder="e.g. Kitchen"
                type="text"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="instruction_text">
              Instructions (shown to cleaner)
            </label>
            <textarea
              className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              id="instruction_text"
              name="instruction_text"
              placeholder="Optional step-by-step instructions…"
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="reference_media_url">
                Reference image URL
              </label>
              <input
                className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                id="reference_media_url"
                name="reference_media_url"
                placeholder="https://…"
                type="url"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="photo_category">Photo category</label>
              <input
                className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                id="photo_category"
                name="photo_category"
                placeholder="e.g. before, after, detail"
                type="text"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                className="h-4 w-4 accent-primary"
                defaultChecked
                name="required"
                type="checkbox"
                value="true"
              />
              <span className="text-sm">Required</span>
            </label>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" htmlFor="sort_order">Order</label>
              <input
                className="w-16 rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                defaultValue={initialItems.length}
                id="sort_order"
                min={0}
                name="sort_order"
                type="number"
              />
            </div>
          </div>

          <button
            className="self-start rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            disabled={addPending}
            type="submit"
          >
            {addPending ? "Adding…" : "Add item"}
          </button>
        </form>
      </section>
    </div>
  );
}
