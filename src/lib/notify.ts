import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "./db"; import { getUser } from "./auth"; import { sendMail } from "./mail"; import { esc } from "./billing"; import { stockState } from "./stockstate"; import { emit } from "./webhooks";
/** Low-stock check, run after anything that changes stock (orders, goods received, adjustments, counts, returns, transfers, reorder-level edits).
 *  - Total available (sellable minus reserved, all warehouses) at or below the reorder level raises ONE unread in-app alert per product ("Out of stock" at zero), and one email to the owners and inventory managers listing everything newly low.
 *  - When stock is back above the level, the old alert is marked read automatically, so the next drop alerts again.
 *  Best-effort: never blocks or fails the user's action. */
export async function notifyLow(orgId: string, productIds: string[]) {
  try {
    const fresh: { id: string; name: string; avail: number; reorderAt: number }[] = [];
    for (const id of new Set(productIds)) {
      const p = await db.product.findFirst({ where: { id, orgId } }); if (!p || p.archived || p.isKit) continue;
      const b = await db.stockBalance.aggregate({ where: { orgId, productId: id }, _sum: { sellable: true, reserved: true } });
      const avail = (b._sum.sellable ?? 0) - (b._sum.reserved ?? 0), href = `/products/${id}`;
      if (stockState(avail, p.reorderAt) === "ok") { await db.notification.updateMany({ where: { orgId, kind: "low_stock", href, readAt: null }, data: { readAt: new Date() } }); continue; }
      if (await db.notification.findFirst({ where: { orgId, kind: "low_stock", href, readAt: null } })) continue;
      const out = avail <= 0;
      await db.notification.create({ data: { orgId, kind: "low_stock", title: `${out ? "Out of stock" : "Low stock"}: ${p.name}`, body: out ? `None available (reorder level ${p.reorderAt})` : `${avail} available (reorder level ${p.reorderAt})`, href } });
      fresh.push({ id, name: p.name, avail, reorderAt: p.reorderAt });
      await emit(orgId, "stock.low", { sku: p.sku, name: p.name, available: avail, reorderAt: p.reorderAt });
    }
    if (fresh.length) await emailLowStock(orgId, fresh);
  } catch (e) { console.error("notifyLow failed", (e as Error).message); }
}
async function emailLowStock(orgId: string, items: { id: string; name: string; avail: number; reorderAt: number }[]) {
  const [people, org] = await Promise.all([db.membership.findMany({ where: { orgId, role: { in: ["OWNER", "INVENTORY_MANAGER"] } }, include: { user: { select: { email: true } } } }), db.organization.findUnique({ where: { id: orgId }, select: { name: true, lowStockEmails: true, alertEmail: true } })]);
  if (org && !org.lowStockEmails) return; // the owner switched low-stock emails off in Settings
  const to: string[] = [...new Set<string>([...(org?.alertEmail ? [org.alertEmail] : []), ...people.map((m) => m.user.email as string)].filter(Boolean))].slice(0, 8); if (!to.length) return;
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, ""), shown = items.slice(0, 20);
  const html = `<p>These products at <b>${esc(org?.name ?? "your business")}</b> need restocking:</p><ul>${shown.map((i) => `<li><a href="${base}/products/${i.id}">${esc(i.name)}</a>: ${i.avail <= 0 ? "<b>out of stock</b>" : `${i.avail} available`} (reorder level ${i.reorderAt})</li>`).join("")}</ul>${items.length > shown.length ? `<p>…and ${items.length - shown.length} more.</p>` : ""}<p><a href="${base}/purchases">Create a purchase order</a></p>`;
  for (const email of to) await sendMail({ to: email, subject: items.length === 1 ? `${items[0].avail <= 0 ? "Out of stock" : "Low stock"}: ${items[0].name}` : `${items.length} products need restocking`, html });
}
export const unreadCount = cache(async () => {
  const u = await getUser(); if (!u) return 0;
  try { // a badge must never take a whole page down (e.g. notifications table not migrated yet)
    const pick = (await cookies()).get("org")?.value, ms = u.memberships;
    const m = ms.find((x) => x.orgId === pick) ?? ms.find((x) => x.role !== "PLATFORM_OPERATOR") ?? ms[0];
    return m ? await db.notification.count({ where: { orgId: m.orgId, readAt: null } }) : 0;
  } catch (e) { console.error("unreadCount failed", (e as Error).message); return 0; }
});
