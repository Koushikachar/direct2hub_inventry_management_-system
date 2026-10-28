import Link from "next/link"; import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell"; import PrintButton from "@/components/PrintButton";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx";
export const dynamic = "force-dynamic";
export default async function Packing({ params }: { params: Promise<{ id: string }> }) {
  const c = await ctx(), { id } = await params;
  const o = await db.order.findFirst({ where: { id, orgId: c.orgId }, include: { lines: { include: { product: true } }, customerRec: true } }); if (!o) notFound();
  const bins = new Map((await db.stockBalance.findMany({ where: { orgId: c.orgId, productId: { in: o.lines.map((l) => l.productId) }, bin: { not: null } }, select: { productId: true, bin: true } })).map((b) => [b.productId, b.bin as string]));
  return <Shell title={`Packing slip · Order #${o.number}`}>
    <div className="flex gap-2 print:hidden"><Link href={`/orders/${o.id}`} className="text-sm text-brand underline">← Order</Link><span className="flex-1" /><PrintButton /></div>
    <article className="glass space-y-5 p-5 md:p-8 print:p-0">
      <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-ink/60">Ship to</p><p className="font-semibold">{o.customer}</p>{o.customerRec?.address && <p className="text-sm">{o.customerRec.address}</p>}{o.customerRec?.phone && <p className="text-sm">{o.customerRec.phone}</p>}</div>
        <div className="text-right text-sm"><p>Order #{o.number}</p><p>{o.createdAt.toLocaleDateString("en-IN")}</p>{o.carrier && <p>{o.carrier} {o.trackingNo}</p>}</div></div>
      <table className="w-full text-sm"><thead><tr className="border-y border-ink/20 text-left"><th className="py-2">Packed</th><th>Bin</th><th>SKU</th><th>Item</th><th className="text-right">Qty</th></tr></thead>
        <tbody>{o.lines.map(l => <tr key={l.id} className="border-b border-ink/10"><td className="py-2"><span className="inline-block h-4 w-4 border border-ink/50" /></td><td>{bins.get(l.productId) ?? ""}</td><td>{l.product.sku}</td><td>{l.product.name}{l.product.barcode ? ` (${l.product.barcode})` : ""}</td><td className="text-right">{l.qty} {l.product.unit}</td></tr>)}</tbody></table></article></Shell>;
}
