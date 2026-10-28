import Link from "next/link";
import { Shell, Stat } from "@/components/Shell"; import { SalesChart, StatusChart } from "@/components/Charts"; import { Panel, Table } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx";
export const dynamic = "force-dynamic";
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const c = await ctx(), orgId = c.orgId, { range } = await searchParams, days = [7, 30, 90].includes(Number(range)) ? Number(range) : 30;
  const since = new Date(Date.now() - days * 864e5), sold = { in: ["DISPATCHED", "DELIVERED"] as ("DISPATCHED" | "DELIVERED")[] };
  const [products, bal, byStatus, low, val, orders, top, mv] = await Promise.all([
    db.product.count({ where: { orgId, archived: false } }),
    db.stockBalance.aggregate({ where: { orgId }, _sum: { sellable: true, reserved: true } }),
    db.order.groupBy({ by: ["status"], where: { orgId, createdAt: { gte: since } }, _count: true }),
    db.$queryRaw<{ name: string; sku: string; avail: bigint; reorder: number }[]>`SELECT p.name, p.sku, COALESCE(SUM(b.sellable-b.reserved),0) avail, p."reorderAt" reorder FROM "Product" p LEFT JOIN "StockBalance" b ON b."productId"=p.id
      WHERE p."orgId"=${orgId} AND p.archived=false GROUP BY p.id HAVING COALESCE(SUM(b.sellable-b.reserved),0) <= p."reorderAt" ORDER BY avail LIMIT 6`,
    db.$queryRaw<{ v: unknown }[]>`SELECT COALESCE(SUM(b.sellable * p."unitCost"),0) v FROM "StockBalance" b JOIN "Product" p ON p.id=b."productId" WHERE b."orgId"=${orgId}`,
    db.order.findMany({ where: { orgId, createdAt: { gte: since }, status: sold }, select: { createdAt: true, total: true } }),
    db.orderLine.groupBy({ by: ["productId"], where: { order: { orgId, createdAt: { gte: since }, status: sold } }, _sum: { qty: true }, orderBy: { _sum: { qty: "desc" } }, take: 5 }),
    db.stockMovement.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const names = Object.fromEntries((await db.product.findMany({ where: { id: { in: [...top.map(t => t.productId), ...mv.map(m => m.productId)] } }, select: { id: true, name: true } })).map(p => [p.id, p.name]));
  const day = (d: Date) => d.toLocaleDateString("en-CA"), byDay = new Map<string, number>();
  orders.forEach(o => byDay.set(day(o.createdAt), (byDay.get(day(o.createdAt)) ?? 0) + Number(o.total)));
  const series = Array.from({ length: days }, (_, i) => { const d = new Date(Date.now() - (days - 1 - i) * 864e5); return { d: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), v: byDay.get(day(d)) ?? 0 }; });
  const revenue = orders.reduce((s, o) => s + Number(o.total), 0), sellable = bal._sum.sellable ?? 0, reserved = bal._sum.reserved ?? 0;
  return (
    <Shell title="Dashboard" active="Dashboard" admin={c.op}>
      <div className="glass flex w-fit gap-1 p-1.5" role="group" aria-label="Date range">{[7, 30, 90].map(d => <Link key={d} href={`/dashboard?range=${d}`} className={`rounded-xl px-4 py-1.5 text-sm transition ${d === days ? "bg-ink text-white" : "hover:bg-white/60"}`}>{d} days</Link>)}</div>
      {products === 0 && c.role === "OWNER" && <Link href="/settings" className="glass block p-4 text-sm transition hover:bg-white/70"><b>New here?</b> Load sample data in Settings to see how everything works. <span className="text-brand underline">Open Settings</span></Link>}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Stat label="Available to sell" value={sellable - reserved} hint={`${sellable} sellable − ${reserved} reserved`} />
        <Stat label="Stock value at cost" value={inr(Number(val[0]?.v ?? 0))} hint="Sellable units × unit cost" />
        <Stat label={`Sales, last ${days} days`} value={inr(revenue)} hint={`${orders.length} dispatched orders, before returns`} />
        <Stat label="Low-stock products" value={low.length} tone="warn" hint={`${products} active products`} /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Sales over time"><p className="mb-2 text-xs text-ink/60">Dispatched order totals by order date</p>{orders.length ? <SalesChart data={series} /> : <p className="py-10 text-center text-sm text-ink/60">No dispatched orders in this period.</p>}</Panel>
        <Panel title="Orders by status"><p className="mb-2 text-xs text-ink/60">Orders created in this period</p>{byStatus.length ? <StatusChart data={byStatus.map(s => ({ s: s.status.toLowerCase(), n: s._count }))} /> : <p className="py-10 text-center text-sm text-ink/60">No orders in this period.</p>}</Panel></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2"><h2 className="font-semibold">Needs reordering</h2><Table head={["Product","Available","Reorder at"]} empty="Nothing is at or below its reorder level." rows={low.map(l => [<Link key="n" href="/products" className="underline">{l.name}</Link>, Number(l.avail), l.reorder])} /></div>
        <div className="space-y-2"><h2 className="font-semibold">Best sellers</h2><Table head={["Product","Units"]} empty="No sales in this period." rows={top.map(t => [names[t.productId], t._sum.qty ?? 0])} /></div></div>
      <div className="space-y-2"><h2 className="font-semibold">Recent stock movements</h2><Table head={["When","Product","Type","Qty"]} empty="No stock activity yet." rows={mv.map(m => [m.createdAt.toLocaleString("en-IN"), names[m.productId] ?? "—", m.type, m.qty])} /></div>
    </Shell>
  );
}
