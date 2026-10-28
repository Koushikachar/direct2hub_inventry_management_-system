import { Shell, Stat } from "@/components/Shell";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx";
export const dynamic = "force-dynamic";
export default async function Analytics() {
  const c = await ctx();
  // Summed inside PostgreSQL: no order rows are loaded into memory, so this stays fast as data grows.
  const rows = await db.$queryRaw<{ name: string; rev: unknown; cogs: unknown }[]>`SELECT p.name, SUM(l.qty * l."unitPrice") AS rev, SUM(l.qty * p."unitCost") AS cogs
    FROM "OrderLine" l JOIN "Order" o ON o.id = l."orderId" JOIN "Product" p ON p.id = l."productId"
    WHERE o."orgId" = ${c.orgId} AND o.status::text IN ('DISPATCHED', 'DELIVERED') GROUP BY p.id, p.name ORDER BY rev DESC`;
  const rev = rows.reduce((s, r) => s + Number(r.rev), 0), cogs = rows.reduce((s, r) => s + Number(r.cogs), 0), top = rows.slice(0, 8), max = Number(top[0]?.rev ?? 1) || 1;
  return <Shell title="Analytics">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4"><Stat label="Revenue (dispatched)" value={`₹${rev.toFixed(0)}`} hint="Price × qty, before returns" /><Stat label="Cost of goods" value={`₹${cogs.toFixed(0)}`} /><Stat label="Gross profit" value={`₹${(rev - cogs).toFixed(0)}`} hint="Revenue − cost of goods" /></div>
    <section className="glass p-5"><h2 className="font-semibold">Top products by revenue</h2>
      {top.length === 0 ? <p className="mt-2 text-sm text-ink/60">No dispatched orders yet. Dispatch an order to see sales here.</p> :
        <ul className="mt-3 space-y-2">{top.map((r) => <li key={r.name} className="text-sm"><div className="flex justify-between gap-3"><span className="min-w-0 break-words">{r.name}</span><span className="tabular-nums">₹{Number(r.rev).toFixed(0)}</span></div>
          <div className="mt-1 h-2 rounded bg-white/60"><div className="h-2 rounded bg-brand" style={{ width: `${(Number(r.rev) / max) * 100}%` }} /></div></li>)}</ul>}</section></Shell>;
}
