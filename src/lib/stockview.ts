import { db } from "./db"; import { kitAvailable } from "./kits";
export type StockInfo = { available: number; elsewhere: number; onHand: number; incoming: number; reorderAt: number; isKit: boolean };
/** Stock figures for the order and purchase forms. `available` is in the default warehouse (where orders are filled and goods are received); `elsewhere` is sellable stock in other warehouses; `incoming` is what open purchase orders have yet to deliver. For a kit, `available` is how many whole kits its parts allow. */
export async function stockSnapshot(orgId: string, products: { id: string; isKit: boolean; reorderAt: number }[]) {
  const [w, bal, inc, parts] = await Promise.all([db.warehouse.findFirst({ where: { orgId }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] }), db.stockBalance.findMany({ where: { orgId }, select: { productId: true, warehouseId: true, sellable: true, reserved: true } }),
    db.$queryRaw<{ productId: string; incoming: number }[]>`SELECT l."productId" AS "productId", SUM(l.qty - l.received)::int AS incoming FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" p ON p.id = l."poId" WHERE p."orgId"=${orgId} AND p.status::text IN ('ORDERED','PARTIAL') AND l.qty > l.received GROUP BY l."productId"`,
    db.kitComponent.findMany({ where: { orgId }, select: { kitId: true, componentId: true, qty: true } })]);
  const here = new Map<string, number>(), other = new Map<string, number>(), hand = new Map<string, number>(), coming = new Map<string, number>(inc.map((r) => [r.productId, r.incoming] as [string, number]));
  for (const b of bal) { hand.set(b.productId, (hand.get(b.productId) ?? 0) + b.sellable); if (b.warehouseId === w?.id) here.set(b.productId, b.sellable - b.reserved); else other.set(b.productId, (other.get(b.productId) ?? 0) + Math.max(0, b.sellable - b.reserved)); }
  const kitParts = new Map<string, { perKit: number; available: number }[]>(); for (const k of parts) kitParts.set(k.kitId, [...(kitParts.get(k.kitId) ?? []), { perKit: k.qty, available: here.get(k.componentId) ?? 0 }]);
  const out = new Map<string, StockInfo>();
  for (const p of products) out.set(p.id, { available: p.isKit ? kitAvailable(kitParts.get(p.id) ?? []) : here.get(p.id) ?? 0, elsewhere: p.isKit ? 0 : other.get(p.id) ?? 0, onHand: hand.get(p.id) ?? 0, incoming: coming.get(p.id) ?? 0, reorderAt: p.reorderAt, isKit: p.isKit });
  return out;
}
