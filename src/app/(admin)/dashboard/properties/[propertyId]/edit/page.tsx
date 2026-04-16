import Link from "next/link";
import { notFound } from "next/navigation";

import { updatePropertyAction } from "@/app/(admin)/dashboard/properties/actions";
import { PropertyForm } from "@/components/properties/property-form";
import { requireRole } from "@/lib/auth/session";
import { getProperty } from "@/lib/queries/properties";

type EditPropertyPageProps = {
  params: Promise<{
    propertyId: string;
  }>;
};

export default async function EditPropertyPage({ params }: EditPropertyPageProps) {
  await requireRole(["owner", "admin"]);
  const { propertyId } = await params;
  const propertyResult = await getProperty(propertyId);

  if (!propertyResult.data) {
    notFound();
  }

  const action = updatePropertyAction.bind(null, propertyId);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-3">
        <Link className="text-sm text-muted-foreground" href="/dashboard/properties">
          ← Back to properties
        </Link>
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Edit property
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            {propertyResult.data.name}
          </h1>
        </div>
      </div>

      {propertyResult.error ? (
        <section className="rounded-[1.5rem] border border-destructive/30 bg-card p-6">
          <p className="text-sm text-muted-foreground">{propertyResult.error}</p>
        </section>
      ) : (
        <section className="rounded-[1.75rem] border border-border/70 bg-card p-6 shadow-sm">
          <PropertyForm
            action={action}
            property={propertyResult.data}
            submitLabel="Save property"
          />
        </section>
      )}
    </main>
  );
}

