import Link from "next/link"; import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell"; import PrintButton from "@/components/PrintButton";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { PLANS } from "@/lib/plans"; import { rupees, receiptNo, METHOD_SHORT } from "@/lib/billing";
export const dynamic = "force-dynamic";
export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const c = await ctx(), { id } = await params, p = await db.subscriptionPayment.findFirst({ where: { id, orgId: c.orgId, status: "PAID" } }); if (!p) notFound();
  const org = await db.organization.findUnique({ where: { id: c.orgId } }), co = process.env.NEXT_PUBLIC_COMPANY_NAME || "Direct2Hub", gst = process.env.PLATFORM_GSTIN;
  const d = (x: Date | null) => x?.toLocaleDateString("en-IN") ?? "—";
  return <Shell title={`Receipt ${receiptNo(p.number)}`}><div className="flex gap-2 print:hidden"><Link href="/subscription" className="text-sm text-brand underline">← My plan</Link><span className="flex-1" /><PrintButton /></div>
    <article className="glass space-y-5 p-5 md:p-8 print:p-0"><header className="flex flex-wrap justify-between gap-4"><div><p className="text-xl font-bold">{co}</p>{process.env.NEXT_PUBLIC_COMPANY_ADDRESS && <p className="max-w-xs text-sm text-ink/70">{process.env.NEXT_PUBLIC_COMPANY_ADDRESS}</p>}{gst && <p className="text-sm">GSTIN: {gst}</p>}</div>
      <div className="text-right"><p className="text-2xl font-extrabold">{p.taxPercent ? "TAX INVOICE / RECEIPT" : "PAYMENT RECEIPT"}</p><p className="text-sm">No. {receiptNo(p.number)}</p><p className="text-sm">Date: {d(p.paidAt)}</p></div></header>
      <section><p className="text-xs uppercase tracking-wide text-ink/60">Billed to</p><p className="font-semibold">{org?.name}</p>{org?.address && <p className="text-sm">{org.address}</p>}{org?.gstin && <p className="text-sm">GSTIN: {org.gstin}</p>}</section>
      <table className="w-full text-sm"><thead><tr className="border-y border-ink/20 text-left"><th className="py-2">Description</th><th className="text-right">Amount</th></tr></thead><tbody><tr className="border-b border-ink/10"><td className="py-2">Direct2Hub {PLANS[p.plan]?.label ?? p.plan} plan ({p.interval === "YEARLY" ? "yearly" : "monthly"})<span className="block text-xs text-ink/60">Service period {d(p.periodStart)} to {d(p.periodEnd)}</span></td><td className="text-right">{rupees(p.base)}</td></tr></tbody></table>
      <dl className="ml-auto max-w-xs space-y-1 text-sm">{p.taxPercent > 0 && <div className="flex justify-between"><dt>GST @ {p.taxPercent}%</dt><dd>{rupees(p.tax)}</dd></div>}<div className="flex justify-between border-t border-ink/20 pt-1 text-base font-bold"><dt>Total paid</dt><dd>{rupees(p.total)}</dd></div></dl>
      <p className="text-xs text-ink/60">Paid via {METHOD_SHORT[p.method] ?? p.method}{p.reference ? ` · ref ${p.reference}` : ""}{p.providerPaymentId ? ` · ${p.providerPaymentId}` : ""}.</p></article></Shell>;
}
