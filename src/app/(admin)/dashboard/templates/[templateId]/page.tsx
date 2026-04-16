import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { getTemplate, listTemplateItems } from "@/lib/queries/templates";
import { TemplateEditor } from "@/components/templates/template-editor";

type Props = { params: Promise<{ templateId: string }> };

export default async function TemplateDetailPage({ params }: Props) {
  await requireRole(["owner", "admin"]);
  const { templateId } = await params;

  const [template, items] = await Promise.all([
    getTemplate(templateId),
    listTemplateItems(templateId),
  ]);

  if (!template) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-10">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
          Templates / {template.name}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{template.name}</h1>
      </div>

      <TemplateEditor template={template} initialItems={items} />
    </main>
  );
}
