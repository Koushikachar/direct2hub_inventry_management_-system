import Link from "next/link"; import { notFound } from "next/navigation";
import { Shell, Stat } from "@/components/Shell"; import { Table } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { expiryState } from "@/lib/tracking";
export const dynamic = "force-dynamic";
/** Recall view: everything that was sold from this batch. */
export default async function BatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const c = await ctx(), { id } = await params, b = await db.batch.findFirst({ where: { id, orgId: c.orgId }, include: { product: true, allocations: { orderBy: { createdAt: "desc" }, take: 200 } } }); if (!b) notFound();
  const ords = await db.order.findMany({ where: { id: { in: b.allocations.map((a) => a.orderId) }, orgId: c.orgId }, select: { id: true, number: true, customer: true, customerRec: { select: { phone: true } } } }), on = new Map(ords.map((o) => [o.id, o])), sold = b.allocations.reduce((n, a) => n + a.qty, 0);
  return <Shell title={`Batch ${b.code}`}><Link href="/traceability" className="text-sm text-brand underline">← Batches</Link>
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"><Stat label="Product" value={b.product.name} /><Stat label="Received" value={b.received} /><Stat label="Left" value={b.qty} /><Stat label="Expiry" value={b.expiresOn ? `${b.expiresOn.toLocaleDateString("en-IN")} (${expiryState(b.expiresOn)})` : "None"} tone={expiryState(b.expiresOn) === "expired" ? "warn" : "brand"} /></div>
    <h2 className="font-semibold">Sold from this batch ({sold} units)</h2>
    <Table head={["Order", "Customer", "Phone", "Units", "Date"]} empty="Nothing has been dispatched from this batch yet." rows={b.allocations.map((a) => { const o = on.get(a.orderId); return [o ? <Link key="o" href={`/orders/${o.id}`} className="text-brand underline">#{o.number}</Link> : "—", o?.customer ?? "—", o?.customerRec?.phone ?? "—", a.qty, a.createdAt.toLocaleDateString("en-IN")]; })} /></Shell>;
}
