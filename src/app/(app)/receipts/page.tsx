import { Shell } from "@/components/Shell"; import { Table } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx";
export const dynamic = "force-dynamic";
export default async function Receipts() {
  const c = await ctx(), rs = await db.goodsReceipt.findMany({ where: { orgId: c.orgId }, orderBy: { createdAt: "desc" }, take: 50 });
  const [pos, ps, us] = await Promise.all([db.purchaseOrder.findMany({ where: { orgId: c.orgId, id: { in: rs.map(r => r.poId) } }, include: { supplier: true } }),
    db.product.findMany({ where: { orgId: c.orgId, id: { in: rs.map(r => r.productId) } } }), db.user.findMany({ where: { id: { in: rs.map(r => r.actorId) } } })]);
  const po = Object.fromEntries(pos.map(p => [p.id, p.supplier.name])), pn = Object.fromEntries(ps.map(p => [p.id, p.name])), u = Object.fromEntries(us.map(x => [x.id, x.email]));
  return <Shell title="Goods receipts" active="Receipts" admin={c.op}>
    <p className="text-sm text-ink/70">Every delivery checked in. Accepted units enter stock; rejected units are recorded here but never counted. Record receipts from the Purchases page.</p>
    <Table head={["When","Supplier","Product","Accepted","Rejected","Note","By"]} empty="No goods received yet." rows={rs.map(r => [r.createdAt.toLocaleString("en-IN"), po[r.poId] ?? "—", pn[r.productId] ?? "—", r.accepted, r.rejected || "—", r.note ?? "—", u[r.actorId] ?? "—"])} /></Shell>;
}
