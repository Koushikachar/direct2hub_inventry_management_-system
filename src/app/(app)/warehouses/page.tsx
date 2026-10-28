import SubmitButton from "@/components/SubmitButton"; import ConfirmSubmit from "@/components/ConfirmSubmit"; import TransferForm from "@/components/TransferForm";
import { randomUUID } from "crypto";
import { Shell, Stat } from "@/components/Shell"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { usage } from "@/lib/plan"; import { addWarehouse, setDefaultWarehouse, deleteWarehouse, transferStock } from "@/app/actions";
export const dynamic = "force-dynamic";
export default async function Warehouses({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const c = await ctx(), { e, ok } = await searchParams, canStock = ["OWNER", "INVENTORY_MANAGER"].includes(c.role);
  const [ws, sums, products, transfers, u, bals] = await Promise.all([
    db.warehouse.findMany({ where: { orgId: c.orgId }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] }),
    db.stockBalance.groupBy({ by: ["warehouseId"], where: { orgId: c.orgId }, _sum: { sellable: true, reserved: true, damaged: true } }),
    db.product.findMany({ where: { orgId: c.orgId, archived: false }, orderBy: { name: "asc" }, take: 500, select: { id: true, sku: true, name: true } }),
    db.stockTransfer.findMany({ where: { orgId: c.orgId }, orderBy: { number: "desc" }, take: 25 }), usage(c.orgId),
    db.stockBalance.findMany({ where: { orgId: c.orgId }, select: { productId: true, warehouseId: true, sellable: true, reserved: true } })]);
  const stock: Record<string, [number, number]> = Object.fromEntries(bals.map((b) => [`${b.productId}:${b.warehouseId}`, [b.sellable, b.reserved] as [number, number]]));
  const sum = new Map<string, { sellable: number | null; reserved: number | null; damaged: number | null }>(sums.map((s) => [s.warehouseId, s._sum] as [string, { sellable: number | null; reserved: number | null; damaged: number | null }])), wn = new Map<string, string>(ws.map((w) => [w.id, w.name] as [string, string])), pn = new Map<string, string>(products.map((p) => [p.id, `${p.name} (${p.sku})`] as [string, string]));
  const def = ws[0]?.id, extra = await db.product.findMany({ where: { id: { in: transfers.map((t) => t.productId).filter((x) => !pn.has(x)) } }, select: { id: true, sku: true, name: true } });
  extra.forEach((p) => pn.set(p.id, `${p.name} (${p.sku})`));
  return <Shell title="Warehouses"><Err e={e} />{ok && <p role="status" className="glass px-4 py-2 text-sm text-brand">{ok}</p>}
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3"><Stat label="Locations" value={`${u.locationCount} / ${u.locations}`} hint={`${u.label} plan`} /><Stat label="Default warehouse" value={ws.find((w) => w.id === def)?.name ?? "—"} hint="New orders and receipts use it" /></div>
    <Table head={["Warehouse", "Sellable", "Reserved", "Damaged", ""]} empty="No warehouses." rows={ws.map((w) => { const s = sum.get(w.id);
      return [<span key="n" className="font-semibold">{w.name}{w.id === def && <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">Default</span>}</span>, s?.sellable ?? 0, s?.reserved ?? 0, s?.damaged ?? 0,
        <span key="a" className="flex flex-wrap justify-end gap-2">{w.id !== def && c.role === "OWNER" && <form action={setDefaultWarehouse}><input type="hidden" name="id" value={w.id} /><SubmitButton className={`${ghost} px-3 py-1`}>Make default</SubmitButton></form>}
          {w.id !== def && canStock && <form action={deleteWarehouse}><input type="hidden" name="id" value={w.id} /><ConfirmSubmit message={`Delete ${w.name}? This can't be undone. Its stock must already be moved out.`} className={`${ghost} px-3 py-1 text-danger`}>Delete</ConfirmSubmit></form>}</span>];  })} />
    {canStock && <Panel title="Add a warehouse"><form action={addWarehouse} className="flex flex-wrap items-end gap-3"><label className="text-sm">Name<input name="name" required maxLength={60} placeholder="Mumbai godown" className={inp} /></label><button className={btn} disabled={u.locationCount >= u.locations}>Add warehouse</button>
      {u.locationCount >= u.locations && <a href="/subscription" className="text-sm text-brand underline">Your plan allows {u.locations}. Upgrade for more</a>}</form></Panel>}
    {canStock && ws.length > 1 && <Panel title="Transfer stock between warehouses"><TransferForm action={transferStock} formKey={randomUUID()} products={products} warehouses={ws.map((w) => ({ id: w.id, name: w.name }))} stock={stock} inp={inp} btn={btn} />
      <p className="mt-2 text-xs text-ink/60">A warehouse can be deleted once it is empty (and is not the default). Only available stock can move; units reserved for confirmed orders stay put. Orders, receipts and returns work on the default warehouse, so transfer stock there before selling it.</p></Panel>}
    <h2 className="font-semibold">Recent transfers</h2>
    <Table head={["#", "Date", "Product", "From", "To", "Qty", "Note"]} empty="No transfers yet." rows={transfers.map((t) => [`TO-${String(t.number).padStart(4, "0")}`, t.createdAt.toLocaleDateString("en-IN"), pn.get(t.productId) ?? "—", wn.get(t.fromId) ?? "Deleted warehouse", wn.get(t.toId) ?? "Deleted warehouse", t.qty, t.note ?? "—"])} /></Shell>;
}
