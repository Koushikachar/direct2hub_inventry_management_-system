import { db } from "./db";
/** Kits (bundles). A kit has no stock of its own: reserving, dispatching or releasing an order line for a kit works on its components instead. */
export type StockLine = { id: string; productId: string; qty: number };
export type KitMap = Map<string, { componentId: string; qty: number }[]>;
/** Replaces each kit line by its components (qty x kit qty). Component lines get a derived id, so their idempotency keys stay unique and stable; ordinary lines are returned unchanged. */
export function explode(lines: StockLine[], kits: KitMap): StockLine[] {
  return lines.flatMap((l) => { const parts = kits.get(l.productId); return parts?.length ? parts.map((p) => ({ id: `${l.id}:${p.componentId}`, productId: p.componentId, qty: l.qty * p.qty })) : [l]; });
}
export async function expandLines(orgId: string, lines: StockLine[]): Promise<StockLine[]> {
  const rows = await db.kitComponent.findMany({ where: { orgId, kitId: { in: [...new Set(lines.map((l) => l.productId))] } } });
  if (!rows.length) return lines;
  const m: KitMap = new Map(); for (const r of rows) m.set(r.kitId, [...(m.get(r.kitId) ?? []), { componentId: r.componentId, qty: r.qty }]);
  return explode(lines, m);
}
/** How many whole kits can be assembled from what is available right now. */
export const kitAvailable = (parts: { perKit: number; available: number }[]) => (parts.length ? Math.max(0, Math.min(...parts.map((p) => Math.floor(p.available / p.perKit)))) : 0);
