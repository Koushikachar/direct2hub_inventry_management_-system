import SubmitButton from "@/components/SubmitButton";
import { randomUUID } from "crypto";
import { Shell } from "@/components/Shell"; import { Err, Panel, Table, inp, btn } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { defineBundle, assembleBundle } from "@/app/actions";
export const dynamic = "force-dynamic";
export default async function Assembly({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const c = await ctx(), { e, ok } = await searchParams, can = ["OWNER", "INVENTORY_MANAGER"].includes(c.role);
  const [ps, bcs, w] = await Promise.all([db.product.findMany({ where: { orgId: c.orgId, archived: false, isKit: false, tracking: "NONE" }, orderBy: { name: "asc" }, take: 500 }),
    db.bundleComponent.findMany({ where: { orgId: c.orgId }, include: { bundle: true, component: true } }), db.warehouse.findFirst({ where: { orgId: c.orgId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] })]);
  const bal = w ? await db.stockBalance.findMany({ where: { orgId: c.orgId, warehouseId: w.id, productId: { in: [...new Set(bcs.map((b) => b.componentId))] } } }) : [], avail = Object.fromEntries(bal.map((b) => [b.productId, b.sellable - b.reserved]));
  const by = new Map<string, typeof bcs>(); bcs.forEach((b) => by.set(b.bundleId, [...(by.get(b.bundleId) ?? []), b]));
  const rows = [...by].map(([, cs]) => [cs[0].bundle.name, cs.map((k) => `${k.qty} × ${k.component.name}`).join(", "), Math.min(...cs.map((k) => Math.floor(Math.max(0, avail[k.componentId] ?? 0) / k.qty)))]);
  const sel = (n: string, req = false) => <select name={n} required={req} defaultValue="" className={inp}><option value="">{req ? "Choose…" : "None"}</option>{ps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;
  return <Shell title="Assembly"><Err e={e} />{ok && <p role="status" className="glass px-4 py-2 text-sm text-brand">{ok}</p>}
    <p className="text-sm text-ink/70">An assembled product is made from other products and keeps its own stock. Assemble it to turn part stock into finished units, then sell it like any other product. (A <b>Kit</b> is different: it has no stock of its own and is sold as its parts.)</p>
    {can && <Panel title="What is it made of?"><form action={defineBundle} className="space-y-3"><label className="block text-sm sm:max-w-sm">Finished product{sel("bundleId", true)}</label>
      {[1, 2, 3, 4, 5].map((i) => <div key={i} className="grid gap-3 sm:grid-cols-[1fr_120px]">{sel(`c${i}`, i === 1)}<input name={`q${i}`} type="number" min={1} defaultValue={1} aria-label={`Quantity ${i}`} className={inp} /></div>)}
      <SubmitButton className={btn}>Save</SubmitButton><p className="text-xs text-ink/60">Saving sets the finished product's unit cost to the cost of its parts. Only plain products (no batch or serial tracking, not kits) can be used.</p></form></Panel>}
    {can && rows.length > 0 && <Panel title="Assemble"><form action={assembleBundle} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="key" value={randomUUID()} />
      <label className="text-sm">Product<select name="bundleId" required className={inp}>{[...by].map(([id, cs]) => <option key={id} value={id}>{cs[0].bundle.name}</option>)}</select></label>
      <label className="text-sm">How many<input name="qty" type="number" min={1} required className={inp} /></label><div className="self-end"><SubmitButton className={btn}>Assemble</SubmitButton></div></form></Panel>}
    <Table head={["Product", "Made of", `Can build now${w ? ` (${w.name})` : ""}`]} empty="Nothing defined yet." rows={rows} /></Shell>;
}
