import SubmitButton from "@/components/SubmitButton";
import { randomUUID } from "crypto";
import { Shell } from "@/components/Shell"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { addPO, receivePO } from "@/app/actions"; import PoForm from "@/components/PoForm"; import { stockSnapshot } from "@/lib/stockview";
export const dynamic = "force-dynamic";
export default async function Purchases({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const c = await ctx(), { e } = await searchParams;
  const [pos, ss, ps] = await Promise.all([db.purchaseOrder.findMany({ where: { orgId: c.orgId }, include: { supplier: true, lines: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.supplier.findMany({ where: { orgId: c.orgId }, take: 200 }), db.product.findMany({ where: { orgId: c.orgId, archived: false }, take: 500 })]);
  const snap = await stockSnapshot(c.orgId, ps), poProducts = ps.filter((p) => !p.isKit).map((p) => ({ id: p.id, label: `${p.name} (${p.sku})`, available: snap.get(p.id)?.available ?? 0, onHand: snap.get(p.id)?.onHand ?? 0, incoming: snap.get(p.id)?.incoming ?? 0, reorderAt: p.reorderAt, cost: Number(p.unitCost) }));
  const nm = Object.fromEntries(ps.map(p => [p.id, p.name])), tr = Object.fromEntries(ps.map(p => [p.id, p.tracking]));
  const rows = pos.flatMap(po => po.lines.map(l => { const left = l.qty - l.received, open = (po.status === "ORDERED" || po.status === "PARTIAL") && left > 0;
    return [po.supplier.name, nm[l.productId], l.qty, l.received, l.rejected, po.status, open ?
      <form key={l.id} action={receivePO} className="grid min-w-[min(100%,220px)] grid-cols-2 gap-2"><input type="hidden" name="lineId" value={l.id} /><input type="hidden" name="key" value={randomUUID()} />
        <label className="text-xs">Accepted<input name="qty" type="number" min={0} max={left} defaultValue={left} className={inp} /></label><label className="text-xs">Rejected<input name="rejected" type="number" min={0} defaultValue={0} className={inp} /></label>
        {tr[l.productId] === "BATCH" && <><input name="batchCode" required placeholder="Batch number" aria-label="Batch number" className={`${inp} col-span-2`} /><label className="col-span-2 text-xs">Expiry date (if any)<input name="expiresOn" type="date" className={inp} /></label></>}
        {tr[l.productId] === "SERIAL" && <textarea name="serials" required rows={3} placeholder={`Serial numbers, one per line (as many as accepted)`} aria-label="Serial numbers" className={`${inp} col-span-2`} />}
        <input name="note" placeholder="Note (damaged, wrong item…)" aria-label="Note" className={`${inp} col-span-2`} /><SubmitButton className={`${ghost} col-span-2 py-2`}>Record receipt</SubmitButton></form> : "—"]; }));
  return <Shell title="Purchases" active="Purchases" admin={c.op}><Err e={e} />
    <Panel title="New purchase order"><p className="mb-3 text-sm text-ink/60">Stock only increases when you receive goods below, not when you create the order.</p>
      <PoForm action={addPO} suppliers={ss.map((x) => ({ id: x.id, name: x.name }))} products={poProducts} /></Panel>
    <Table head={["Supplier","Product","Ordered","Accepted","Rejected","Status","Receive goods"]} empty="No purchase orders yet." rows={rows} /></Shell>;
}
