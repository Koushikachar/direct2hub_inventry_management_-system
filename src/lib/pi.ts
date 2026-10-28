import { db } from "./db";
const SOLD = ["DISPATCHED", "DELIVERED"] as ("DISPATCHED" | "DELIVERED")[], DAY = 864e5, n = (x: unknown) => Number(x ?? 0);
export type Facts = { id: string; name: string; sku: string; unit: string; price: number; cost: number; gst: number; description: string | null; hasImage: boolean; available: number; reserved: number; reorderAt: number;
  sold30: number; soldPrev30: number; sold90: number; revenue90: number; perDay: number; coverDays: number | null; marginPct: number | null; suggestReorder: number; lastSoldDaysAgo: number | null };
export type Signal = { tone: "warn" | "ok" | "info"; text: string };
const r1 = (x: number) => Math.round(x * 10) / 10;
/** Everything the Product Intelligence page and AI know about one product. All numbers are computed here from your own orders and stock, never by the AI. */
export async function productFacts(orgId: string, id: string): Promise<Facts | null> {
  const p = await db.product.findFirst({ where: { id, orgId }, include: { balances: true } }); if (!p) return null;
  const lines = await db.orderLine.findMany({ where: { productId: id, order: { orgId, status: { in: SOLD }, createdAt: { gte: new Date(Date.now() - 90 * DAY) } } }, select: { qty: true, unitPrice: true, order: { select: { createdAt: true } } }, take: 5000 });
  const age = (d: Date) => (Date.now() - d.getTime()) / DAY; let sold30 = 0, soldPrev30 = 0, sold90 = 0, revenue90 = 0, last: number | null = null;
  for (const l of lines) { const a = age(l.order.createdAt); sold90 += l.qty; revenue90 += l.qty * n(l.unitPrice); if (a <= 30) sold30 += l.qty; else if (a <= 60) soldPrev30 += l.qty; if (last === null || a < last) last = a; }
  const sellable = p.balances.reduce((t, b) => t + b.sellable, 0), reserved = p.balances.reduce((t, b) => t + b.reserved, 0), available = sellable - reserved;
  const perDay = sold30 > 0 ? sold30 / 30 : sold90 / 90, price = n(p.price), cost = n(p.unitCost);
  return { id: p.id, name: p.name, sku: p.sku, unit: p.unit, price, cost, gst: p.taxRate, description: p.description, hasImage: !!p.imageUrl, available, reserved, reorderAt: p.reorderAt, sold30, soldPrev30, sold90, revenue90: Math.round(revenue90),
    perDay: r1(perDay), coverDays: perDay > 0 ? Math.round(Math.max(0, available) / perDay) : null, marginPct: price > 0 ? r1(((price - cost) / price) * 100) : null, suggestReorder: perDay > 0 ? Math.max(0, Math.ceil(perDay * 30 - available)) : 0, lastSoldDaysAgo: last === null ? null : Math.floor(last) };
}
/** Plain-language findings from the numbers alone, so the page is useful even with no AI key. */
export function signals(f: Facts): Signal[] {
  const s: Signal[] = [];
  if (f.available <= 0 && f.perDay > 0) s.push({ tone: "warn", text: `Out of stock, but it sells about ${f.perDay} a day. You are losing sales until it is restocked.` });
  else if (f.coverDays !== null && f.coverDays < 14) s.push({ tone: "warn", text: `Only about ${f.coverDays} day${f.coverDays === 1 ? "" : "s"} of stock left at the current speed. Ordering ${f.suggestReorder} ${f.unit} would cover the next 30 days.` });
  if (f.available > 0 && f.sold90 === 0) s.push({ tone: "info", text: "No sales in the last 90 days. Think about a discount, a bundle, or stopping reorders." });
  if (f.soldPrev30 >= 5 && f.sold30 >= f.soldPrev30 * 1.5) s.push({ tone: "ok", text: `Selling faster: ${f.sold30} in the last 30 days against ${f.soldPrev30} the 30 days before.` });
  if (f.soldPrev30 >= 5 && f.sold30 <= f.soldPrev30 * 0.5) s.push({ tone: "warn", text: `Sales have slowed: ${f.sold30} in the last 30 days against ${f.soldPrev30} the 30 days before.` });
  if (f.marginPct !== null) s.push(f.marginPct < 15 ? { tone: "warn", text: `Margin is only ${f.marginPct}% (price ₹${f.price}, cost ₹${f.cost}). Check the price or the supplier cost.` } : f.marginPct >= 40 ? { tone: "ok", text: `Healthy margin of ${f.marginPct}%.` } : { tone: "info", text: `Margin is ${f.marginPct}%.` });
  if (!f.description) s.push({ tone: "info", text: "No description yet. The AI can write one below." });
  return s;
}
/** Catalog-wide: what is about to run out, and what is sitting unsold. */
export async function overview(orgId: string) {
  const [ps, s30, s90] = await Promise.all([db.product.findMany({ where: { orgId, archived: false, isKit: false }, include: { balances: true }, take: 500 }),
    db.orderLine.groupBy({ by: ["productId"], where: { order: { orgId, status: { in: SOLD }, createdAt: { gte: new Date(Date.now() - 30 * DAY) } } }, _sum: { qty: true } }),
    db.orderLine.groupBy({ by: ["productId"], where: { order: { orgId, status: { in: SOLD }, createdAt: { gte: new Date(Date.now() - 90 * DAY) } } }, _sum: { qty: true } })]);
  const m30 = new Map<string, number>(s30.map((x: { productId: string; _sum: { qty: number | null } }) => [x.productId, x._sum.qty ?? 0] as [string, number])), m90 = new Map<string, number>(s90.map((x: { productId: string; _sum: { qty: number | null } }) => [x.productId, x._sum.qty ?? 0] as [string, number]));
  const rows = ps.map((p) => { const avail = p.balances.reduce((t, b) => t + b.sellable - b.reserved, 0), a30 = m30.get(p.id) ?? 0, a90 = m90.get(p.id) ?? 0, rate = a30 > 0 ? a30 / 30 : a90 / 90; return { id: p.id, name: p.name, sku: p.sku, avail, rate, sold90: a90, cover: rate > 0 ? Math.round(Math.max(0, avail) / rate) : null, stuck: avail * n(p.unitCost) }; });
  return { soon: rows.filter((r) => r.cover !== null && r.cover < 14).sort((a, b) => (a.cover ?? 0) - (b.cover ?? 0)).slice(0, 6), dead: rows.filter((r) => r.avail > 0 && r.sold90 === 0).sort((a, b) => b.stuck - a.stuck).slice(0, 6) };
}
