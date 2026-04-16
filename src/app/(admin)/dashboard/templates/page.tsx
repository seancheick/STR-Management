import type { Route } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listTemplates } from "@/lib/queries/templates";
import { PresetCards } from "@/components/templates/preset-cards";

export default async function TemplatesPage() {
  await requireRole(["owner", "admin"]);

  const templates = await listTemplates();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Checklists</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Templates</h1>
        </div>
        <Link
          href={"/dashboard/templates/new" as Route}
          className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          New template
        </Link>
      </div>

      <PresetCards />

      <div>
        <h2 className="text-lg font-semibold">Your saved templates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Templates you create here can be assigned to any job.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed border-border bg-card/70 p-10 text-center">
          <p className="text-muted-foreground">No templates yet.</p>
          <Link
            href={"/dashboard/templates/new" as Route}
            className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Create your first template
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/templates/${t.id}` as Route}
              className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-border/70 bg-card px-6 py-5 shadow-sm transition hover:border-primary/30"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{t.name}</p>
                  {t.is_default && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      default
                    </span>
                  )}
                </div>
                {t.template_type && (
                  <p className="text-sm text-muted-foreground capitalize">{t.template_type}</p>
                )}
              </div>
              <p className="shrink-0 text-sm text-muted-foreground">Edit →</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
