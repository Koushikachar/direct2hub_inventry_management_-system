import { db } from "./db"; import { reserveMany } from "./inventory"; import { expandLines } from "./kits";
/** Backorders (off by default; the owner switches them on in Settings).
 *  An order that can't be fully reserved is still CONFIRMED but is flagged `backordered` and holds NO stock. It can't be dispatched until every line can be reserved in full.
 *  All-or-nothing on purpose: one order never holds half its stock, so cancelling, kits, batches and serial numbers keep working exactly as before. */
export const canDispatch = (o: { status: string; backordered: boolean }) => o.status === "CONFIRMED" && !o.backordered;
/** Tries to reserve a waiting order in full. Returns true when it is now fully reserved (and the flag is cleared). */
export async function tryReserve(orgId: string, warehouseId: string, actorId: string, orderId: string) {
  const o = await db.order.findFirst({ where: { id: orderId, orgId, status: "CONFIRMED", backordered: true }, include: { lines: true } }); if (!o) return false;
  const sl = await expandLines(orgId, o.lines.map((l) => ({ id: l.id, productId: l.productId, qty: l.qty })));
  const r = await reserveMany({ orgId, warehouseId, actorId, orderId: o.id, lines: sl }); if (!r.ok) return false;
  const n = await db.order.updateMany({ where: { id: o.id, backordered: true }, data: { backordered: false } });
  if (n.count) await db.notification.create({ data: { orgId, kind: "backorder", title: `Order #${o.number} is fully reserved`, body: "Stock arrived. It can be dispatched now.", href: `/orders/${o.id}` } });
  return !!n.count;
}
/** After stock arrives (goods received, returns restocked, transfers, adjustments), waiting orders are filled oldest first. */
export async function fulfilBackorders(orgId: string, warehouseId: string, actorId: string) {
  try {
    const waiting = await db.order.findMany({ where: { orgId, backordered: true, status: "CONFIRMED" }, orderBy: { createdAt: "asc" }, take: 50, select: { id: true } }); let done = 0;
    for (const o of waiting) if (await tryReserve(orgId, warehouseId, actorId, o.id)) done++;
    return done;
  } catch (e) { console.error("fulfilBackorders failed", (e as Error).message); return 0; }
}
