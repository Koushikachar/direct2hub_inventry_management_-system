import { db } from "@/lib/db"; import { apiAuth } from "@/lib/apikeys"; import { imgUrl } from "@/lib/images";
/** GET /api/v1/products?q=cap&cursor=<id>  Up to 100 products per page with description and image links. Pass the returned nextCursor to get the next page. */
export async function GET(req: Request) {
  const a = await apiAuth(req); if (a instanceof Response) return a;
  const u = new URL(req.url), q = u.searchParams.get("q")?.slice(0, 60), cursor = u.searchParams.get("cursor")?.slice(0, 40);
  const ps = await db.product.findMany({ where: { orgId: a.orgId, archived: false, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {}) }, orderBy: { id: "asc" }, take: 101, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  const page = ps.slice(0, 100);
  return Response.json({ data: page.map((p) => ({ id: p.id, sku: p.sku, name: p.name, description: p.description, price: Number(p.price), unit: p.unit, imageUrl: p.imageUrl, thumbnailUrl: imgUrl(p.imageUrl, 300) })), nextCursor: ps.length > 100 ? page[99].id : null });
}
