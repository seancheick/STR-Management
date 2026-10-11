import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getCleanerFinancialSummary } from "@/lib/queries/cleaner-finance";
import { CleanerLedger } from "@/components/cleaner/cleaner-ledger";
export default async function CleanerAccountPage({
  params,
}: {
  params: Promise<{ cleanerId: string }>;
}) {
  await requireRole(["owner", "admin", "supervisor"]);
  const { cleanerId } = await params;
  const finance = await getCleanerFinancialSummary(cleanerId);
  const ledger = finance.ledger;
  if (!ledger) notFound();
  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-8">
      <Link
        href="/dashboard/payouts"
        className="inline-flex min-h-11 items-center underline"
      >
        Back to payouts
      </Link>
      <h1 className="text-2xl font-semibold">Cleaning ledger</h1>
      <p className="text-lg font-semibold">Current amount due: {finance.balance.toLocaleString("en-US", {style:"currency",currency:"USD"})}</p>
      <CleanerLedger account={ledger.account} entries={ledger.entries} />
    </main>
  );
}
