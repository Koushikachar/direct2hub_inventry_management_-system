import { randomUUID } from "crypto"; import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { Pager } from "@/components/ui";
import { Shell } from "@/components/Shell"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { createOrder, orderAct } from "@/app/actions"; import OrderLines from "@/components/OrderLines"; import { stockSnapshot } from "@/lib/stockview";
export const dynamic = "force-dynamic";
const next: Record<string, [string, string][]> = { DRAFT: [["confirm", "Confirm & reserve"], ["cancel", "Cancel"]], CONFIRMED: [["dispatch", "Dispatch"], ["cancel", "Cancel"]] };
export default async function Orders({ searchParams }: { searchParams: Promise<{ e?: string; page?: string }> }) {
  const c = await ctx(), { e, page } = await searchParams, pg = Math.max(1, Number(page) || 1);
  const [os, ps, cs] = await Promise.all([db.order.findMany({ where: { orgId: c.orgId }, orderBy: { number: "desc" }, skip: (pg - 1) * 25, take: 26, include: { lines: { include: { product: true } } } }), db.product.findMany({ where: { orgId: c.orgId, archived: false }, take: 500 }), db.customer.findMany({ where: { orgId: c.orgId }, orderBy: { name: "asc" }, take: 500 })]);
  const snap = await stockSnapshot(c.orgId, ps), picks = ps.map((p) => ({ id: p.id, label: `${p.name} (${p.sku})${p.isKit ? " · kit" : ""}`, isKit: p.isKit, available: snap.get(p.id)?.available ?? 0, elsewhere: snap.get(p.id)?.elsewhere ?? 0, reorderAt: p.reorderAt }));
  return <Shell title="Orders" active="Orders" admin={c.op}><Err e={e} />
    <Panel title="New order"><form action={createOrder} className="space-y-3"><input type="hidden" name="key" value={randomUUID()} />
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Customer (from your directory)<select name="customerId" defaultValue="" className={inp}><option value="">None, type a name instead</option>{cs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="block text-sm">Or customer name<input name="customer" className={inp} /></label></div>
      <OrderLines products={picks} />
      <SubmitButton className={btn}>Create draft</SubmitButton></form></Panel>
    <Table head={["#","Customer","Items","Total","Status","Actions"]} empty="No orders yet. Create a draft above." rows={os.slice(0, 25).map(o => [<Link key="n" href={`/orders/${o.id}`} className="font-semibold text-brand underline">#{o.number}</Link>, o.customer, o.lines.map(l => `${l.qty}× ${l.product.name}`).join(", "), `₹${o.total}`, o.backordered ? "CONFIRMED · waiting for stock" : o.status,
      <div key="a" className="flex gap-2">{(next[o.status] ?? []).filter(([a]) => !(o.backordered && a === "dispatch")).map(([a, l]) => <form key={a} action={orderAct}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="act" value={a} /><SubmitButton className={ghost}>{l}</SubmitButton></form>)}</div>])} /><Pager page={pg} hasNext={os.length > 25} /></Shell>;
}
