import { db } from "@/lib/db"; import { apiAuth } from "@/lib/apikeys";
/** GET /api/v1/stock?sku=ABC  (or without sku: first 200 products). Stock is summed across warehouses. */
export async function GET(req: Request) {
  const a = await apiAuth(req); if (a instanceof Response) return a;
  const sku = new URL(req.url).searchParams.get("sku")?.slice(0, 64);
  const ps = await db.product.findMany({ where: { orgId: a.orgId, archived: false, ...(sku ? { sku } : {}) }, include: { balances: true }, orderBy: { sku: "asc" }, take: 200 });
  return Response.json({ data: ps.map((p) => { const sellable = p.balances.reduce((s, b) => s + b.sellable, 0), reserved = p.balances.reduce((s, b) => s + b.reserved, 0); return { sku: p.sku, name: p.name, sellable, reserved, available: sellable - reserved, reorderLevel: p.reorderAt, price: Number(p.price) }; }) });
}
