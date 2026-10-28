import Link from "next/link"; import { notFound } from "next/navigation";
import { Shell, Stat } from "@/components/Shell"; import { Panel, inp, ghost } from "@/components/ui"; import SubmitButton from "@/components/SubmitButton"; import ProductIntel from "@/components/ProductIntel";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { aiReady } from "@/lib/ai"; import { productFacts, signals, overview } from "@/lib/pi";
export const dynamic = "force-dynamic";
const tone = { warn: "border-turmeric/60 bg-turmeric/15", ok: "border-brand/40 bg-brand/10", info: "border-white/70 bg-white/50" };
export default async function Intelligence({ searchParams }: { searchParams: Promise<{ id?: string; q?: string }> }) {
  const c = await ctx(), { id, q } = await searchParams, can = ["OWNER", "INVENTORY_MANAGER"].includes(c.role), cost = c.role !== "ORDER_STAFF";
  if (id) {
    const f = await productFacts(c.orgId, id); if (!f) notFound();
    return <Shell title={`Intelligence · ${f.name}`} active="Product intelligence" admin={c.op}>
      <p className="-mt-2 text-sm"><Link href="/intelligence" className="text-brand underline">All products</Link> · <Link href={`/products/${f.id}`} className="text-brand underline">Open product ({f.sku})</Link></p>
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"><Stat label="Available" value={f.available} hint={f.reorderAt ? `Reorder at ${f.reorderAt}` : undefined} tone={f.available <= f.reorderAt ? "warn" : "brand"} /><Stat label="Sold, last 30 days" value={f.sold30} hint={`${f.sold90} in 90 days`} />
        <Stat label="Days of stock" value={f.coverDays ?? "—"} hint={f.perDay ? `Selling ~${f.perDay} a day` : "No recent sales"} tone={f.coverDays !== null && f.coverDays < 14 ? "warn" : "brand"} /><Stat label={cost ? "Margin" : "Price"} value={cost ? (f.marginPct === null ? "—" : `${f.marginPct}%`) : `₹${f.price}`} hint={cost ? `₹${f.price} sell, ₹${f.cost} cost` : undefined} /></div>
      <Panel title="What the numbers say"><ul className="space-y-2">{signals(f).map((s, i) => <li key={i} className={`rounded-xl border px-3 py-2 text-sm ${tone[s.tone]}`}>{s.text}</li>)}</ul><p className="mt-2 text-xs text-ink/60">Based on dispatched and delivered orders. Days of stock assumes the recent selling speed continues.</p></Panel>
      <Panel title="AI tools for this product"><ProductIntel id={f.id} ready={aiReady()} canSave={can} /></Panel></Shell>;
  }
  const term = (q ?? "").trim().slice(0, 60), [list, ov] = await Promise.all([db.product.findMany({ where: { orgId: c.orgId, archived: false, ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { sku: { contains: term, mode: "insensitive" } }] } : {}) }, orderBy: { name: "asc" }, take: 15, select: { id: true, name: true, sku: true } }), overview(c.orgId)]);
  const Row = ({ r, note }: { r: { id: string; name: string; sku: string }; note: string }) => <li key={r.id}><Link href={`/intelligence?id=${r.id}`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm hover:bg-white/60"><span className="min-w-0 truncate font-medium text-brand">{r.name} <span className="font-normal text-ink/60">{r.sku}</span></span><span className="shrink-0 text-xs text-ink/70">{note}</span></Link></li>;
  return <Shell title="Product intelligence" active="Product intelligence" admin={c.op}>
    <p className="-mt-2 max-w-2xl text-sm text-ink/70">Pick a product to see how it sells, when it will run out and what to do next, and to write its listing with AI.</p>
    <div className="grid gap-4 md:grid-cols-2"><Panel title="Running out soon">{ov.soon.length ? <ul>{ov.soon.map((r) => <Row key={r.id} r={r} note={r.avail <= 0 ? "Out of stock" : `${r.cover} days left`} />)}</ul> : <p className="text-sm text-ink/60">Nothing is about to run out at the current selling speed.</p>}</Panel>
      <Panel title="Not selling (90 days)">{ov.dead.length ? <ul>{ov.dead.map((r) => <Row key={r.id} r={r} note={`${r.avail} in stock`} />)}</ul> : <p className="text-sm text-ink/60">Every product in stock has sold recently.</p>}</Panel></div>
    <Panel title="Choose a product"><form className="flex gap-2"><input name="q" defaultValue={term} placeholder="Search name or SKU" aria-label="Search products" className={`${inp} min-w-0 flex-1`} /><SubmitButton className={`${ghost} shrink-0`}>Search</SubmitButton></form>
      <ul className="mt-2">{list.map((r) => <Row key={r.id} r={r} note="Open" />)}</ul>{!list.length && <p className="mt-2 text-sm text-ink/60">No products found.</p>}</Panel></Shell>;
}
