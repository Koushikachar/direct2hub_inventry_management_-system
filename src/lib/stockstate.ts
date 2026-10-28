/** Pure helpers for showing stock when ordering or buying. "available" = sellable minus reserved. */
export type StockState = "out" | "low" | "ok";
export const stockState = (available: number, reorderAt: number): StockState => (available <= 0 ? "out" : available <= reorderAt ? "low" : "ok");
export function stockLabel(available: number, reorderAt: number) { const s = stockState(available, reorderAt); return s === "out" ? "out of stock" : s === "low" ? `${available} available, low` : `${available} available`; }
/** What to say under a sales-order line. `warn` = the order can't be confirmed as typed; `low` = it can, but it leaves you under your reorder level. */
export function orderHint(a: { qty: number; available: number; elsewhere: number; reorderAt: number }) {
  const { qty, available, elsewhere, reorderAt } = a; if (!(qty >= 1)) return null;
  if (qty > available) return { tone: "warn" as const, text: `${available <= 0 ? "None" : `Only ${available}`} available${elsewhere > 0 ? ` here (${elsewhere} more in other warehouses: transfer it first)` : ""}. You can save a draft, but it can't be confirmed until there is enough stock.` };
  const left = available - qty; if (left <= reorderAt) return { tone: "low" as const, text: `${available} available. After this order ${left} will be left, at or below your reorder level of ${reorderAt}.` };
  return { tone: "ok" as const, text: `${available} available.` };
}
/** A starting point for a purchase: top stock (including goods already on order) up to twice the reorder level. 0 when no reorder level is set. */
export const suggestOrderQty = (available: number, incoming: number, reorderAt: number) => (reorderAt > 0 ? Math.max(0, reorderAt * 2 - available - incoming) : 0);
