import { db } from "./db"; import { decrypt } from "./secrets"; import { emitOrder } from "./webhooks";
/** Only real *.myshopify.com store names are accepted, so a connection can never point at another host. */
export const validShop = (s: string) => /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(s);
const api = (shop: string, path: string) => `https://${shop}/admin/api/${process.env.SHOPIFY_API_VERSION || "2026-01"}/${path}`;
export async function pingShopify(shop: string, token: string) {
  const r = await fetch(api(shop, "shop.json"), { headers: { "X-Shopify-Access-Token": token }, signal: AbortSignal.timeout(15000), redirect: "error" }).catch(() => null);
  if (!r) throw new Error("Couldn't reach that Shopify store"); if (r.status === 401 || r.status === 403) throw new Error("Shopify rejected the access token"); if (!r.ok) throw new Error(`Shopify answered HTTP ${r.status}`);
}
/** Imports open Shopify orders (newest 50) as DRAFT orders. An order is imported only if every line's SKU matches one of your products and it is in rupees. Safe to run repeatedly. */
export async function syncShopify(orgId: string) {
  const conn = await db.connection.findUnique({ where: { orgId_provider: { orgId, provider: "SHOPIFY" } } }); if (!conn) return { created: 0, skipped: 0, error: "Shopify isn't connected" };
  const shop = String((conn.config as any)?.shop ?? ""); let created = 0, skipped = 0, error: string | null = null;
  try {
    if (!validShop(shop)) throw new Error("Invalid store address");
    const r = await fetch(api(shop, "orders.json?status=open&limit=50"), { headers: { "X-Shopify-Access-Token": decrypt(conn.secretEnc) }, signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!r.ok) throw new Error(r.status === 401 ? "Shopify rejected the access token" : `Shopify answered HTTP ${r.status}`);
    const orders: any[] = (await r.json()).orders ?? [];
    for (const o of orders) {
      const ref = `shopify:${o.id}`; if (await db.order.findFirst({ where: { orgId, externalRef: ref }, select: { id: true } })) continue;
      const lines: any[] = o.line_items ?? [], skus = lines.map((l) => String(l.sku ?? "").trim()).filter(Boolean);
      const by = new Map((await db.product.findMany({ where: { orgId, archived: false, sku: { in: skus } } })).map((p) => [p.sku, p]));
      const items = lines.flatMap((l) => { const p = by.get(String(l.sku ?? "").trim()), q = Number(l.quantity); return p && q >= 1 ? [{ p, qty: q, price: Number(l.price) || 0 }] : []; });
      if ((o.currency && o.currency !== "INR") || !items.length || items.length < lines.length) { skipped++; continue; }
      const name = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") || o.email || `Shopify ${o.name}`;
      try {
        const ord = await db.$transaction(async (tx) => { const last = await tx.order.aggregate({ where: { orgId }, _max: { number: true } });
          return tx.order.create({ data: { orgId, number: (last._max.number ?? 0) + 1, customer: String(name).slice(0, 120), externalRef: ref, total: items.reduce((t, i) => t + i.price * i.qty, 0), lines: { create: items.map((i) => ({ productId: i.p.id, qty: i.qty, unitPrice: i.price })) } } }); });
        created++; await emitOrder("order.created", orgId, ord.id);
      } catch (e: any) { if (e.code !== "P2002") throw e; }
    }
  } catch (e: any) { error = String(e.message ?? e).slice(0, 200); }
  await db.connection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastError: error } });
  return { created, skipped, error };
}
