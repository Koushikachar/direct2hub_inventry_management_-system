import SubmitButton from "@/components/SubmitButton";
import { randomUUID } from "crypto";
import { Shell } from "@/components/Shell"; import { Err, Panel, Table, inp, btn } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { recordCount } from "@/app/actions";
export const dynamic = "force-dynamic";
export default async function Counts({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const c = await ctx(), { e, ok } = await searchParams;
  const [bal, mv] = await Promise.all([db.stockBalance.findMany({ where: { orgId: c.orgId, product: { archived: false } }, include: { product: true }, orderBy: { product: { name: "asc" } }, take: 500 }),
    db.stockMovement.findMany({ where: { orgId: c.orgId, type: "ADJUST", reason: { startsWith: "Stock count" } }, orderBy: { createdAt: "desc" }, take: 20 })]);
  const nm = Object.fromEntries(bal.map(b => [b.productId, b.product.name]));
  return <Shell title="Stock counts" active="Counts" admin={c.op}><Err e={e} />{ok && <p role="status" className="glass px-4 py-2 text-sm text-brand">{ok}</p>}
    {["OWNER", "INVENTORY_MANAGER"].includes(c.role) ? <Panel title="Record a physical count">
      <p className="mb-3 text-sm text-ink/70">Count the sellable units on the shelf. If it differs from the system, stock is adjusted and the difference is written to the ledger.</p>
      <form action={recordCount} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="key" value={randomUUID()} />
        <label className="text-sm">Product<select name="productId" required className={inp}>{bal.map(b => <option key={b.id} value={b.productId}>{b.product.name} (system: {b.sellable})</option>)}</select></label>
        <label className="text-sm">Counted quantity<input name="counted" type="number" min={0} required className={inp} /></label>
        <div className="self-end"><SubmitButton className={`${btn} w-full`}>Record count</SubmitButton></div></form></Panel>
      : <p className="text-sm text-ink/60">Only owners and inventory managers can record counts.</p>}
    <h2 className="font-semibold">Recent counts</h2>
    <Table head={["When","Product","Change","Details"]} empty="No counts recorded yet." rows={mv.map(m => [m.createdAt.toLocaleString("en-IN"), nm[m.productId] ?? "—", m.qty > 0 ? `+${m.qty}` : m.qty, m.reason])} /></Shell>;
}
