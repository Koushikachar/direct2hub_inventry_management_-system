import Link from "next/link";
import { Shell } from "@/components/Shell"; import { Table } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { inr, invNo, cnNo } from "@/lib/gst";
export const dynamic = "force-dynamic";
function invStatus(total: number, paid: number, due: Date) { return total <= 0 ? "Credited in full" : paid >= total ? "Paid" : paid > 0 ? "Partly paid" : due < new Date() ? "Overdue" : "Unpaid"; }
export default async function Invoices() {
  const c = await ctx(), is = await db.invoice.findMany({ where: { orgId: c.orgId }, orderBy: { number: "desc" }, take: 50, include: { payments: { select: { amount: true } }, creditNotes: { select: { total: true } } } }),
    cns = await db.creditNote.findMany({ where: { orgId: c.orgId }, orderBy: { number: "desc" }, take: 25, include: { invoice: { select: { number: true, customerName: true } } } });
  const row = (i: (typeof is)[number]) => { const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0), cr = i.creditNotes.reduce((x, n) => x + Number(n.total), 0), t = Number(i.total) - cr;
    return [<Link key="n" href={`/invoices/${i.id}`} className="font-semibold text-brand underline">{invNo(i.number)}</Link>, i.customerName, i.createdAt.toLocaleDateString("en-IN"), inr(t), inr(Math.max(0, t - paid)), invStatus(t, paid, i.dueOn)]; };
  return <Shell title="Invoices"><p className="text-sm text-ink/70">Create an invoice from a confirmed or dispatched order (open the order, then press Create invoice).</p>
    <Table head={["Invoice","Customer","Date","Total","Balance due","Status"]} empty="No invoices yet." rows={is.map(row)} />
    <h2 className="font-semibold">Credit notes</h2>
    <Table head={["Credit note","Invoice","Customer","Date","Amount"]} empty="No credit notes yet. Open an invoice to issue one." rows={cns.map(n => [<Link key="n" href={`/credit-notes/${n.id}`} className="font-semibold text-brand underline">{cnNo(n.number)}</Link>, invNo(n.invoice.number), n.invoice.customerName, n.createdAt.toLocaleDateString("en-IN"), inr(Number(n.total))])} /></Shell>;
}
