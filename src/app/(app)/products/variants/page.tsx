import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { Shell } from "@/components/Shell"; import { Err, Panel, inp, btn } from "@/components/ui";
import { ctx } from "@/lib/ctx"; import { createVariants } from "@/app/actions";
export const dynamic = "force-dynamic";
export default async function Variants({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const c = await ctx(), { e } = await searchParams, can = ["OWNER", "INVENTORY_MANAGER"].includes(c.role);
  return <Shell title="Add variants" active="Products" admin={c.op}><Err e={e} /><Link href="/products" className="text-sm text-brand underline">← Products</Link>
    <p className="text-sm text-ink/70">One product in several sizes and colours. We create a separate product for every combination (for example TEE-M-RED), each with its own stock, so orders, invoices and counts work exactly as they do for any product.</p>
    {!can ? <p className="glass p-4 text-sm">Only the owner or an inventory manager can add products.</p> : <Panel title="New item group"><form action={createVariants} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm">Product name<input name="name" required maxLength={100} placeholder="Cotton T-shirt" className={inp} /></label><label className="text-sm">Base SKU<input name="baseSku" required maxLength={30} placeholder="TEE" className={inp} /></label>
      <label className="text-sm">GST rate<select name="taxRate" defaultValue="12" className={inp}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}</select></label>
      <label className="text-sm">Selling price (₹)<input name="price" type="number" min={0} step="any" required className={inp} /></label><label className="text-sm">Unit cost (₹)<input name="cost" type="number" min={0} step="any" required className={inp} /></label><label className="text-sm">HSN code (optional)<input name="hsn" maxLength={10} className={inp} /></label>
      <label className="text-sm">Sizes (comma separated)<input name="sizes" placeholder="S, M, L, XL" className={inp} /></label><label className="text-sm">Colours (comma separated)<input name="colours" placeholder="Red, Blue, Black" className={inp} /></label>
      <label className="text-sm">Reorder level (each)<input name="reorder" type="number" min={0} defaultValue={0} className={inp} /></label><label className="text-sm">Opening stock (each)<input name="opening" type="number" min={0} defaultValue={0} className={inp} /></label>
      <div className="self-end sm:col-span-2"><SubmitButton className={btn}>Create variants</SubmitButton></div></form>
      <p className="mt-2 text-xs text-ink/60">Fill in sizes, colours, or both (up to 60 combinations). They count towards your plan's product limit. Prices can be changed per variant afterwards.</p></Panel>}</Shell>;
}
