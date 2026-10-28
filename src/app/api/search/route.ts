import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { allow } from "@/lib/ratelimit";
export const dynamic = "force-dynamic";
/** Powers the command menu. Only the signed-in account's own records; a few results per kind; rate limited. */
export async function GET(req: Request) {
  let c: Awaited<ReturnType<typeof ctx>>; try { c = await ctx(); } catch { return Response.json({ results: [] }, { status: 401 }); }
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60); if (q.length < 2) return Response.json({ results: [] });
  if (!(await allow(`search:${c.orgId}`, 120, 60_000))) return Response.json({ results: [] }, { status: 429 });
  const n = /^#?\d{1,9}$/.test(q) ? Number(q.replace("#", "")) : null, like = { contains: q, mode: "insensitive" as const };
  const [ps, cs, os, inv] = await Promise.all([
    db.product.findMany({ where: { orgId: c.orgId, archived: false, OR: [{ name: like }, { sku: like }, { barcode: like }] }, select: { id: true, name: true, sku: true }, take: 5, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: { orgId: c.orgId, name: like }, select: { id: true, name: true }, take: 4, orderBy: { name: "asc" } }),
    db.order.findMany({ where: { orgId: c.orgId, OR: [{ customer: like }, ...(n ? [{ number: n }] : [])] }, select: { id: true, number: true, customer: true }, take: 4, orderBy: { createdAt: "desc" } }),
    n ? db.invoice.findMany({ where: { orgId: c.orgId, number: n }, select: { id: true, number: true }, take: 3 }) : Promise.resolve([]),
  ]);
  const results = [
    ...ps.map((p) => ({ id: `p:${p.id}`, label: p.name, hint: `Product · ${p.sku}`, href: `/products/${p.id}`, group: "Results" })),
    ...cs.map((x) => ({ id: `c:${x.id}`, label: x.name, hint: "Customer", href: `/customers`, group: "Results" })),
    ...os.map((o) => ({ id: `o:${o.id}`, label: `Order #${o.number}`, hint: o.customer, href: `/orders/${o.id}`, group: "Results" })),
    ...inv.map((i) => ({ id: `i:${i.id}`, label: `Invoice #${i.number}`, hint: "Invoice", href: `/invoices/${i.id}`, group: "Results" })),
  ];
  return Response.json({ results }, { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } });
}
