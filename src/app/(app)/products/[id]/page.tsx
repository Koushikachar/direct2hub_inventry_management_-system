import SubmitButton from "@/components/SubmitButton";
import { notFound } from "next/navigation";
import { Shell, Stat } from "@/components/Shell"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { updateProduct, setArchived, archiveProductQuick, restoreProductQuick } from "@/app/actions"; import UndoArchive from "@/components/UndoArchive"; import AiDescribe from "@/components/AiDescribe"; import ProductImageField from "@/components/ProductImageField"; import { aiReady } from "@/lib/ai"; import { imagesReady } from "@/lib/images";
export const dynamic = "force-dynamic";
export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; ok?: string }> }) {
  const c = await ctx(), { id } = await params, { e, ok } = await searchParams;
  const p = await db.product.findFirst({ where: { id, orgId: c.orgId }, include: { balances: true, kitParts: { include: { component: true } } } }); if (!p) notFound();
  const mv = await db.stockMovement.findMany({ where: { orgId: c.orgId, productId: id }, orderBy: { createdAt: "desc" }, take: 30 });
  const s = (k: "sellable" | "reserved" | "damaged") => p.balances.reduce((t, b) => t + b[k], 0), can = ["OWNER", "INVENTORY_MANAGER"].includes(c.role);
  const F = ([n, l, v, t]: string[]) => <label key={n} className="text-sm">{l}<input name={n} defaultValue={v} required={n !== "hsn"} type={t} step="any" min={t === "number" ? 0 : undefined} disabled={!can} className={inp} /></label>;
  return <Shell title={p.name} active="Products" admin={c.op}><Err e={e} />{ok && <p role="status" className="glass px-4 py-2 text-sm text-brand">{ok}</p>}
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"><Stat label="Sellable" value={s("sellable")} /><Stat label="Reserved" value={s("reserved")} /><Stat label="Available" value={s("sellable") - s("reserved")} /><Stat label="Damaged" value={s("damaged")} tone="warn" /></div>
    <Panel title={`Details · ${p.sku}${p.archived ? " · archived" : ""}`}><form action={updateProduct} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><input type="hidden" name="id" value={p.id} />
      {[["name","Name",p.name,"text"],["hsn","HSN code",p.hsn ?? "","text"],["price","Selling price (₹)",String(p.price),"number"],["cost","Unit cost (₹)",String(p.unitCost),"number"],["reorder","Reorder level",String(p.reorderAt),"number"]].map(F)}
      <label className="text-sm">GST rate<select name="taxRate" defaultValue={String(p.taxRate)} disabled={!can} className={inp}>{[0,5,12,18,28].map(r => <option key={r} value={r}>{r}%</option>)}</select></label><label className="text-sm">Barcode<input name="barcode" defaultValue={p.barcode ?? ""} disabled={!can} className={inp} /></label><label className="text-sm">Unit<input name="unit" defaultValue={p.unit} maxLength={12} disabled={!can} className={inp} /></label>
      {!p.isKit && <label className="text-sm">Tracking<select name="tracking" defaultValue={p.tracking} disabled={!can} className={inp}><option value="NONE">None</option><option value="BATCH">By batch and expiry</option><option value="SERIAL">By serial number</option></select></label>}
      <AiDescribe defaultValue={p.description ?? ""} enabled={aiReady()} disabled={!can} />
      {can && <div className="flex items-end gap-2"><SubmitButton className={btn}>Save changes</SubmitButton></div>}</form>
      <div className="mt-4 border-t border-white/60 pt-4"><ProductImageField productId={p.id} url={p.imageUrl} enabled={imagesReady()} disabled={!can} /></div>
      {can && (p.archived ? <form action={setArchived} className="mt-3"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="archived" value="0" /><SubmitButton className={ghost}>Restore product</SubmitButton></form> : <div className="mt-3"><UndoArchive id={p.id} name={p.name} archive={archiveProductQuick} restore={restoreProductQuick} className={ghost} /></div>)}</Panel>
    {p.isKit && <Panel title="This kit contains"><ul className="text-sm">{p.kitParts.map(k => <li key={k.id} className="flex justify-between border-b border-white/70 py-1.5"><a href={`/products/${k.componentId}`} className="text-brand underline">{k.component.name}</a><span>× {k.qty}</span></li>)}</ul><p className="mt-2 text-xs text-ink/60">A kit has no stock of its own. Selling it reserves and deducts these products. To change what's inside, archive this kit and create a new one.</p></Panel>}
    {p.groupName && <p className="text-sm text-ink/60">Variant of <a href={`/products?q=${encodeURIComponent(p.groupName)}`} className="text-brand underline">{p.groupName}</a>{p.variantLabel ? ` · ${p.variantLabel}` : ""}</p>}
    {p.tracking !== "NONE" && <p className="text-sm"><a href="/traceability" className="font-medium text-brand underline">See {p.tracking === "BATCH" ? "batches and expiry dates" : "serial numbers"} for this product</a></p>}
    <h2 className="font-semibold">Stock history</h2>
    <Table head={["When","Type","Qty","Reason"]} empty="No stock activity yet." rows={mv.map(m => [m.createdAt.toLocaleString("en-IN"), m.type, m.qty, m.reason ?? "—"])} /></Shell>;
}
