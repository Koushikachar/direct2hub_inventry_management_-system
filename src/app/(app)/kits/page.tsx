import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { Shell } from "@/components/Shell"; import { Err, Panel, Table, inp, btn } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { kitAvailable } from "@/lib/kits"; import { createKit } from "@/app/actions"; import { inr } from "@/lib/gst";
export const dynamic = "force-dynamic";
export default async function Kits({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const c = await ctx(), { e } = await searchParams, can = ["OWNER", "INVENTORY_MANAGER"].includes(c.role);
  const [kits, parts, w] = await Promise.all([db.product.findMany({ where: { orgId: c.orgId, isKit: true, archived: false }, orderBy: { name: "asc" }, take: 200, include: { kitParts: { include: { component: true } } } }),
    db.product.findMany({ where: { orgId: c.orgId, isKit: false, archived: false, tracking: { not: "SERIAL" } }, orderBy: { name: "asc" }, take: 500, select: { id: true, sku: true, name: true } }),
    db.warehouse.findFirst({ where: { orgId: c.orgId }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] })]);
  const ids = [...new Set(kits.flatMap((k) => k.kitParts.map((p) => p.componentId)))];
  const bal = ids.length && w ? await db.stockBalance.findMany({ where: { orgId: c.orgId, warehouseId: w.id, productId: { in: ids } } }) : [], avail = new Map<string, number>(bal.map((b) => [b.productId, b.sellable - b.reserved] as [string, number]));
  const rows = Array.from({ length: 6 }, (_, i) => i + 1);
  return <Shell title="Kits" active="Products" admin={c.op}><Err e={e} />
    <p className="text-sm text-ink/70">A kit (bundle) is sold as one item with its own price, but selling it reserves and deducts the products inside it. Kits keep no stock of their own: how many you can sell depends on the parts you have.</p>
    {can && <Panel title="Create a kit"><form action={createKit} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-sm">SKU<input name="sku" required maxLength={30} className={inp} /></label><label className="text-sm lg:col-span-2">Kit name<input name="name" required maxLength={100} className={inp} /></label>
      <label className="text-sm">Price (₹)<input name="price" type="number" min={0} step="any" required className={inp} /></label><label className="text-sm">GST rate<select name="taxRate" defaultValue="18" className={inp}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}</select></label></div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">What's inside (up to 6 products)</legend>{rows.map((i) => <div key={i} className="grid grid-cols-[1fr_6rem] gap-2"><select name={`cp${i}`} defaultValue="" aria-label={`Component ${i}`} className={inp}><option value="">{i === 1 ? "Choose a product" : "None"}</option>{parts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select><input name={`cq${i}`} type="number" min={1} defaultValue={1} aria-label={`Quantity ${i}`} className={inp} /></div>)}</fieldset>
      <SubmitButton className={btn}>Create kit</SubmitButton><p className="text-xs text-ink/60">Parts can't be changed after the kit is created. To change them, archive the kit and make a new one. Serial-tracked products can't go in a kit.</p></form></Panel>}
    <Table head={["Kit", "Contains", "Price", "Can sell now"]} empty="No kits yet." rows={kits.map((k) => [<span key="n"><Link href={`/products/${k.id}`} className="font-medium text-brand underline">{k.name}</Link><span className="block text-xs text-ink/60">{k.sku}</span></span>,
      k.kitParts.map((p) => `${p.component.name} × ${p.qty}`).join(", "), inr(Number(k.price)), <b key="a">{kitAvailable(k.kitParts.map((p) => ({ perKit: p.qty, available: avail.get(p.componentId) ?? 0 })))}</b>])} /></Shell>;
}
