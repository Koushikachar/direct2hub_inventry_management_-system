import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx";
const cell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
export async function GET() {
  const c = await ctx();
  const ps = await db.product.findMany({ where: { orgId: c.orgId }, orderBy: { sku: "asc" } });
  const csv = ["sku,name,hsn,price,unit_cost,reorder_at", ...ps.map(p => [p.sku, p.name, p.hsn, p.price, p.unitCost, p.reorderAt].map(cell).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=products.csv", "cache-control": "no-store" } });
}
