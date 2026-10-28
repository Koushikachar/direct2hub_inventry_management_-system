import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { Shell, Stat } from "@/components/Shell"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { expiryState } from "@/lib/tracking"; import { registerBatch, registerSerials, restockSerial } from "@/app/actions";
export const dynamic = "force-dynamic";
const day = (d: Date | null) => (d ? d.toLocaleDateString("en-IN") : "No expiry");
const tone = { expired: "bg-danger/15 text-danger", soon: "bg-turmeric/25 text-ink", ok: "bg-brand/15 text-brand", none: "bg-white/60 text-ink/60" } as const;
const label = { expired: "Expired", soon: "Expires soon", ok: "OK", none: "—" } as const;
export default async function Traceability({ searchParams }: { searchParams: Promise<{ t?: string; q?: string; e?: string; ok?: string }> }) {
  const c = await ctx(), { t, q, e, ok } = await searchParams, serials = t === "serials", can = ["OWNER", "INVENTORY_MANAGER"].includes(c.role);
  const tabs = <nav aria-label="Traceability" className="glass flex w-fit gap-1 p-1.5">{[["batches", "Batches & expiry"], ["serials", "Serial numbers"]].map(([k, l]) => <Link key={k} href={`/traceability?t=${k}`} className={`rounded-xl px-4 py-1.5 text-sm transition ${(serials ? "serials" : "batches") === k ? "bg-ink text-white" : "hover:bg-white/60"}`}>{l}</Link>)}</nav>;
  const msg = <><Err e={e} />{ok && <p role="status" className="glass px-4 py-2 text-sm text-brand">{ok}</p>}</>;
  if (!serials) {
    const [batches, tracked, whs, sums, used] = await Promise.all([
      db.batch.findMany({ where: { orgId: c.orgId, qty: { gt: 0 } }, orderBy: [{ expiresOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], take: 300, include: { product: { select: { name: true, sku: true } } } }),
      db.product.findMany({ where: { orgId: c.orgId, tracking: "BATCH", archived: false }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, sku: true } }),
      db.warehouse.findMany({ where: { orgId: c.orgId }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] }),
      db.stockBalance.findMany({ where: { orgId: c.orgId, product: { tracking: "BATCH" } }, select: { productId: true, warehouseId: true, sellable: true } }),
      db.batch.groupBy({ by: ["productId", "warehouseId"], where: { orgId: c.orgId }, _sum: { qty: true } })]);
    const wn = new Map<string, string>(whs.map((w) => [w.id, w.name] as [string, string])), inB = new Map<string, number>(used.map((u) => [`${u.productId}|${u.warehouseId}`, u._sum.qty ?? 0] as [string, number]));
    const loose = sums.map((s) => ({ ...s, loose: s.sellable - (inB.get(`${s.productId}|${s.warehouseId}`) ?? 0) })).filter((s) => s.loose > 0), pn = new Map<string, string>(tracked.map((p) => [p.id, p.name] as [string, string]));
    const st = batches.map((b) => expiryState(b.expiresOn)), expired = batches.filter((_, i) => st[i] === "expired").reduce((n, b) => n + b.qty, 0), soon = batches.filter((_, i) => st[i] === "soon").length;
    return <Shell title="Batches & serials">{tabs}{msg}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4"><Stat label="Batches in stock" value={batches.length} /><Stat label="Expiring within 30 days" value={soon} tone={soon ? "warn" : "brand"} /><Stat label="Expired units still on the shelf" value={expired} tone={expired ? "warn" : "brand"} hint={expired ? "Write these off with a stock adjustment" : undefined} /></div>
      <Table head={["Product", "Batch", "Warehouse", "Expiry", "Left", "Status"]} empty="No batches yet. Mark a product as batch-tracked on its page, then receive goods with a batch number." rows={batches.map((b, i) => [<span key="p">{b.product.name}<span className="block text-xs text-ink/60">{b.product.sku}</span></span>, <Link key="b" href={`/traceability/batch/${b.id}`} className="font-medium text-brand underline">{b.code}</Link>, wn.get(b.warehouseId) ?? "—", day(b.expiresOn), b.qty, <span key="s" className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[st[i]]}`}>{label[st[i]]}</span>])} />
      <p className="text-xs text-ink/60">Dispatch takes from the earliest-expiring batch that hasn't expired. Click a batch to see which orders it went on (for a recall).</p>
      {loose.length > 0 && can && <Panel title="Stock not yet in a batch"><p className="mb-3 text-sm text-ink/70">These units were on the shelf before batch tracking started (or were adjusted by hand). Assign them to a batch so they are traceable.</p>
        <ul className="mb-4 text-sm">{loose.slice(0, 8).map((l) => <li key={`${l.productId}${l.warehouseId}`}>{pn.get(l.productId) ?? "Product"} · {wn.get(l.warehouseId)} · <b>{l.loose}</b> unit(s) without a batch</li>)}</ul>
        <form action={registerBatch} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="text-sm lg:col-span-2">Product<select name="productId" required className={inp}>{tracked.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></label>
          <label className="text-sm">Warehouse<select name="warehouseId" className={inp}>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label className="text-sm">Batch number<input name="code" required maxLength={40} className={inp} /></label>
          <label className="text-sm">Expiry (optional)<input name="expiresOn" type="date" className={inp} /></label><label className="text-sm">Units<input name="qty" type="number" min={1} required className={inp} /></label><div className="self-end"><SubmitButton className={btn}>Assign to batch</SubmitButton></div></form></Panel>}</Shell>;
  }
  const term = (q ?? "").trim().slice(0, 60);
  const [rows, tracked] = await Promise.all([db.serialNumber.findMany({ where: { orgId: c.orgId, ...(term ? { serial: { contains: term, mode: "insensitive" } } : {}) }, orderBy: { receivedAt: "desc" }, take: 100, include: { product: { select: { name: true } } } }),
    db.product.findMany({ where: { orgId: c.orgId, tracking: "SERIAL", archived: false }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, sku: true } })]);
  const oids = [...new Set(rows.map((r) => r.orderId).filter((x): x is string => !!x))], ords = oids.length ? await db.order.findMany({ where: { id: { in: oids }, orgId: c.orgId }, select: { id: true, number: true, customer: true } }) : [], on = new Map(ords.map((o) => [o.id, o]));
  return <Shell title="Batches & serials">{tabs}{msg}
    <form className="flex flex-wrap items-end gap-3"><input type="hidden" name="t" value="serials" /><label className="text-sm">Find a serial number<input name="q" defaultValue={term} placeholder="Type part or all of it" className={`${inp} w-64`} /></label><SubmitButton className={ghost}>Search</SubmitButton></form>
    <Table head={["Serial", "Product", "Status", "Order", "Sold on", ""]} empty={term ? "No serial number matches that." : "No serial numbers yet. Mark a product as serial-tracked on its page, then receive goods with serial numbers."} rows={rows.map((r) => { const o = r.orderId ? on.get(r.orderId) : null;
      return [<b key="s" className="select-all">{r.serial}</b>, r.product.name, r.status === "IN_STOCK" ? "In stock" : r.status === "ASSIGNED" ? "Held for an order" : "Sold", o ? <Link key="o" href={`/orders/${o.id}`} className="text-brand underline">#{o.number} · {o.customer}</Link> : "—", r.soldAt ? r.soldAt.toLocaleDateString("en-IN") : "—",
        r.status === "SOLD" && can ? <form key="r" action={restockSerial}><input type="hidden" name="id" value={r.id} /><SubmitButton className={`${ghost} px-3 py-1`}>Returned, back in stock</SubmitButton></form> : ""]; })} />
    {can && tracked.length > 0 && <Panel title="Register serial numbers for stock you already have"><form action={registerSerials} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="t" value="serials" /><label className="text-sm">Product<select name="productId" required className={inp}>{tracked.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></label>
      <label className="text-sm sm:col-span-2">Serial numbers (one per line)<textarea name="serials" rows={5} required className={inp} /></label><div><SubmitButton className={btn}>Register</SubmitButton></div></form>
      <p className="mt-2 text-xs text-ink/60">This does not change stock counts: the units are already counted. You can't register more serial numbers than units in stock. A returned unit's stock goes back through the Returns screen.</p></Panel>}</Shell>;
}
