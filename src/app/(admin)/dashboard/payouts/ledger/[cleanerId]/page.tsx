import Link from "next/link";
import {notFound} from "next/navigation";
import {requireRole} from "@/lib/auth/session";
import {createServerSupabaseClient} from "@/lib/supabase/server";
import {getCleanerFinancialSummary} from "@/lib/queries/cleaner-finance";
import {CleanerLedger} from "@/components/cleaner/cleaner-ledger";
import {RecordPaymentForm,PaymentHistory} from "@/components/payouts/record-payment-form";
import {dateKeyInTimeZone} from "@/lib/ical/timezone";
const money=(n:number)=>n.toLocaleString("en-US",{style:"currency",currency:"USD"});
export default async function CleanerAccountPage({params}:{params:Promise<{cleanerId:string}>}) {
 const profile=await requireRole(["owner","admin","supervisor"]);const {cleanerId}=await params;
 const client=await createServerSupabaseClient();const {data:cleaner}=await client.from("cleaners").select("full_name").eq("id",cleanerId).eq("owner_id",profile.owner_id).eq("role","cleaner").maybeSingle();
 if(!cleaner)notFound();
 const finance=await getCleanerFinancialSummary(cleanerId);const ledger=finance.ledger;
 const account=ledger?.account??{cleaner_id:cleanerId,owner_id:profile.owner_id,label:cleaner.full_name,reconciled_through:"1900-01-01",source_note:"Completed cleaning pay and recorded payments."};
 const canManage=["owner","admin"].includes(profile.role);
 return <main className="mx-auto max-w-xl space-y-6 px-5 py-8"><Link href="/dashboard/payouts" className="inline-flex min-h-11 items-center underline">Back to payouts</Link><h1 className="text-2xl font-semibold">{ledger?.account.label??cleaner.full_name} · account</h1>
 <section className="space-y-3 rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{finance.balance<0?"Credit balance":"Amount remaining"}</p><p className="text-3xl font-semibold tabular-nums text-primary">{money(Math.abs(finance.balance))}</p><dl className="space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>Reconciled opening balance</dt><dd>{money(finance.ledgerBalance)}</dd></div><div className="flex justify-between gap-3"><dt>New completed jobs & extras</dt><dd>+{money(finance.summary.projectedTotal)}</dd></div><div className="flex justify-between gap-3"><dt>Earlier job payments</dt><dd>−{money(finance.legacyPaidTotal)}</dd></div><div className="flex justify-between gap-3"><dt>Recorded payments</dt><dd>−{money(finance.recordedPaymentsTotal)}</dd></div></dl><p className="text-xs leading-5 text-muted-foreground">Payment records reduce this balance. Reports group cleaning earnings; creating or approving a report does not record a payment.</p></section>
 {canManage&&<RecordPaymentForm cleanerId={cleanerId} balance={finance.balance} today={dateKeyInTimeZone(new Date(),"America/New_York")} />}
 <PaymentHistory payments={finance.payments} canManage={canManage} />
 <a className="inline-flex min-h-11 items-center text-sm underline" href={`/dashboard/payouts/ledger/${cleanerId}/export.csv`}>Download full ledger CSV</a>
 <CleanerLedger account={account} entries={finance.statementEntries} current />
 </main>;
}
