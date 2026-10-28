import { z } from "zod";
import { db } from "@/lib/db"; import { apiAuth } from "@/lib/apikeys"; import { emitOrder } from "@/lib/webhooks"; import { trackingUrl } from "@/lib/couriers";
const Body = z.object({ externalRef: z.string().trim().min(1).max(64), customer: z.string().trim().min(1).max(120),
  lines: z.array(z.object({ sku: z.string().trim().min(1).max(64), qty: z.number().int().min(1).max(100000), price: z.number().min(0).max(100000000).optional() })).min(1).max(50) });
const shape = (o: { id: string; number: number; status: string }, extra = {}) => ({ id: o.id, number: o.number, status: o.status, ...extra });
/** POST /api/v1/orders creates a DRAFT order. externalRef makes it safe to retry: the same reference never creates a second order. */
export async function POST(req: Request) {
  const a = await apiAuth(req); if (a instanceof Response) return a;
  const b = Body.safeParse(await req.json().catch(() => null)); if (!b.success) return Response.json({ error: "Invalid body", details: b.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  const d = b.data, dup = () => db.order.findFirst({ where: { orgId: a.orgId, externalRef: d.externalRef } });
  const ex = await dup(); if (ex) return Response.json(shape(ex, { duplicate: true }));
  const want = new Map<string, { qty: number; price?: number }>(); for (const l of d.lines) { const w = want.get(l.sku); want.set(l.sku, { qty: (w?.qty ?? 0) + l.qty, price: l.price ?? w?.price }); }
  const prods = await db.product.findMany({ where: { orgId: a.orgId, archived: false, sku: { in: [...want.keys()] } } }), bySku = new Map(prods.map((p) => [p.sku, p]));
  const missing = [...want.keys()].find((s) => !bySku.has(s)); if (missing) return Response.json({ error: `Unknown SKU: ${missing}` }, { status: 422 });
  const items = [...want].map(([sku, w]) => ({ p: bySku.get(sku)!, qty: w.qty, price: w.price ?? Number(bySku.get(sku)!.price) }));
  try {
    const o = await db.$transaction(async (tx) => { const last = await tx.order.aggregate({ where: { orgId: a.orgId }, _max: { number: true } });
      return tx.order.create({ data: { orgId: a.orgId, number: (last._max.number ?? 0) + 1, customer: d.customer, externalRef: d.externalRef, total: items.reduce((t, i) => t + i.price * i.qty, 0), lines: { create: items.map((i) => ({ productId: i.p.id, qty: i.qty, unitPrice: i.price })) } } }); });
    await db.auditLog.create({ data: { orgId: a.orgId, actorId: `api:${a.keyId}`, action: "api.order_created", detail: { number: o.number, externalRef: d.externalRef } } });
    await emitOrder("order.created", a.orgId, o.id); return Response.json(shape(o), { status: 201 });
  } catch (e: any) { if (e.code === "P2002") { const again = await dup(); if (again) return Response.json(shape(again, { duplicate: true })); return Response.json({ error: "Please retry" }, { status: 409 }); } throw e; }
}
/** GET /api/v1/orders?externalRef=... returns status, payment status and tracking so a marketplace can be updated. */
export async function GET(req: Request) {
  const a = await apiAuth(req); if (a instanceof Response) return a;
  const ref = new URL(req.url).searchParams.get("externalRef")?.slice(0, 64); if (!ref) return Response.json({ error: "externalRef is required" }, { status: 400 });
  const o = await db.order.findFirst({ where: { orgId: a.orgId, externalRef: ref } }); if (!o) return Response.json({ error: "Not found" }, { status: 404 });
  const cars = await db.carrier.findMany({ where: { orgId: a.orgId } });
  return Response.json(shape(o, { externalRef: ref, paymentStatus: o.paymentStatus, carrier: o.carrier, trackingNo: o.trackingNo, trackingUrl: o.carrier && o.trackingNo ? trackingUrl(o.carrier, o.trackingNo, cars) : null }));
}
