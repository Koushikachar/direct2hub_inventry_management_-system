import SubmitButton from "@/components/SubmitButton";
import { randomUUID } from "crypto"; import { CODES } from "@/lib/currency";
import { Shell } from "@/components/Shell"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { addCustomer, addPriceList, deletePriceList } from "@/app/actions"; import { STATES } from "@/lib/gst";
export const dynamic = "force-dynamic";
export default async function Customers({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const c = await ctx(), { e } = await searchParams, [cs, pls] = await Promise.all([db.customer.findMany({ where: { orgId: c.orgId }, orderBy: { name: "asc" }, take: 300, include: { priceList: true } }), db.priceList.findMany({ where: { orgId: c.orgId }, orderBy: { name: "asc" }, take: 50 })]);
  const canLists = ["OWNER", "INVENTORY_MANAGER"].includes(c.role), pct = (n: unknown) => { const v = Number(n); return `${v > 0 ? "+" : ""}${v}%`; };
  return <Shell title="Customers"><Err e={e} />
    <Panel title="Add customer"><form action={addCustomer} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><input type="hidden" name="key" value={randomUUID()} />
      <label className="text-sm">Name<input name="name" required className={inp} /></label><label className="text-sm">Phone<input name="phone" type="tel" className={inp} /></label><label className="text-sm">Email<input name="email" type="email" className={inp} /></label>
      <label className="text-sm">GSTIN (optional)<input name="gstin" maxLength={15} placeholder="29ABCDE1234F1Z5" className={inp} /></label>
      <label className="text-sm">State<select name="state" defaultValue="" className={inp}><option value="">Not set</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="text-sm">Address<input name="address" className={inp} /></label>
      <label className="text-sm">Currency<select name="currency" defaultValue="INR" className={inp}>{CODES.map(x => <option key={x}>{x}</option>)}</select></label>
      <label className="text-sm">Price list<select name="priceListId" defaultValue="" className={inp}><option value="">Standard prices</option>{pls.map(l => <option key={l.id} value={l.id}>{l.name} ({pct(l.percent)})</option>)}</select></label>
      <div className="self-end"><SubmitButton className={btn}>Save customer</SubmitButton></div></form>
      <p className="mt-2 text-xs text-ink/60">Customers in a different state from your business get IGST on invoices; the same state gets CGST + SGST. A price list changes the price new orders for that customer start with.</p></Panel>
    {canLists && <Panel title="Price lists"><form action={addPriceList} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Name<input name="name" required maxLength={60} placeholder="Wholesale" className={inp} /></label>
      <label className="text-sm">Percent<input name="percent" type="number" step="0.01" min={-90} max={100} required placeholder="-10" className={`${inp} w-32`} /></label><SubmitButton className={btn}>Add price list</SubmitButton></form>
      <p className="mt-2 text-xs text-ink/60">-10 means 10% below the product price (wholesale); 5 means 5% above. Existing orders keep the price they were created with.</p>
      {pls.length > 0 && <ul className="mt-3 divide-y divide-white/70 text-sm">{pls.map(l => <li key={l.id} className="flex items-center justify-between gap-3 py-2"><span><b>{l.name}</b> <span className="text-ink/60">{pct(l.percent)} · {cs.filter(x => x.priceListId === l.id).length} customers</span></span>
        <form action={deletePriceList}><input type="hidden" name="id" value={l.id} /><SubmitButton className={`${ghost} px-3 py-1 text-danger`}>Delete</SubmitButton></form></li>)}</ul>}</Panel>}
    <Table head={["Name","Phone","Email","GSTIN","State","Price list"]} empty="No customers yet. Add one above, then pick them when creating an order." rows={cs.map(x => [x.name, x.phone ?? "—", x.email ?? "—", x.gstin ?? "—", x.state ?? "—", x.priceList ? `${x.priceList.name} (${pct(x.priceList.percent)})` : "Standard"])} /></Shell>;
}
