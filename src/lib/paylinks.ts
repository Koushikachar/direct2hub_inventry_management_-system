import { db } from "./db"; import { decrypt } from "./secrets"; import { emit } from "./webhooks";
/** Online payment of customers' invoices through the business's OWN Razorpay account. Their keys are stored encrypted (see secrets.ts) and only ever used here, on the server. */
export type Gateway = { keyId: string; secret: string; webhookSecret: string | null };
export async function gatewayFor(orgId: string): Promise<Gateway | null> {
  const g = await db.paymentGateway.findUnique({ where: { orgId } }); if (!g) return null;
  try { return { keyId: g.keyId, secret: decrypt(g.secretEnc), webhookSecret: g.webhookSecretEnc ? decrypt(g.webhookSecretEnc) : null }; } catch { return null; } // wrong/changed APP_ENC_KEY: treat as not configured
}
const auth = (g: Gateway) => `Basic ${Buffer.from(`${g.keyId}:${g.secret}`).toString("base64")}`;
type R<T> = { ok: true; data: T } | { ok: false; error: string };
async function call(g: Gateway, path: string, init?: { method: "POST"; body: unknown }): Promise<R<any>> {
  try {
    const r = await fetch(`https://api.razorpay.com/v1/${path}`, { method: init?.method ?? "GET", cache: "no-store", headers: { Authorization: auth(g), ...(init ? { "Content-Type": "application/json" } : {}) }, body: init ? JSON.stringify(init.body) : undefined });
    const j: any = await r.json().catch(() => ({})); if (!r.ok) return { ok: false, error: j?.error?.description ?? `Razorpay returned ${r.status}` }; return { ok: true, data: j };
  } catch { return { ok: false, error: "Couldn't reach Razorpay" }; }
}
export const rzpCheckKeys = (g: Gateway) => call(g, "payment_links?count=1");
export async function rzpCreateLink(g: Gateway, a: { paise: number; ref: string; description: string; name: string; email?: string | null; phone?: string | null }): Promise<R<{ id: string; url: string }>> {
  const r = await call(g, "payment_links", { method: "POST", body: { amount: a.paise, currency: "INR", accept_partial: false, reference_id: a.ref, description: a.description.slice(0, 250),
    customer: { name: a.name.slice(0, 100), ...(a.email ? { email: a.email } : {}), ...(a.phone && /^\+?[0-9]{10,13}$/.test(a.phone) ? { contact: a.phone } : {}) }, notify: { email: false, sms: false }, reminder_enable: false, expire_by: Math.floor(Date.now() / 1000) + 7 * 86400 } });
  return r.ok ? (r.data.id && r.data.short_url ? { ok: true, data: { id: r.data.id, url: r.data.short_url } } : { ok: false, error: "Razorpay didn't return a link" }) : r;
}
export async function rzpGetLink(g: Gateway, id: string): Promise<R<{ status: string; amountPaid: number; paymentId: string | null }>> {
  const r = await call(g, `payment_links/${encodeURIComponent(id)}`); if (!r.ok) return r;
  return { ok: true, data: { status: String(r.data.status), amountPaid: Number(r.data.amount_paid ?? 0), paymentId: r.data.payments?.[0]?.payment_id ?? null } };
}
/** Records an online payment against the invoice, exactly like a hand-entered one (row lock, balance check, order status). Never records more than is still owed; safe to call twice for the same payment. */
export async function applyOnlinePayment(a: { orgId: string; invoiceId: string; linkId: string; paise: number; paymentId: string }) {
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${a.invoiceId} AND "orgId"=${a.orgId} FOR UPDATE`;
      const inv = await tx.invoice.findFirst({ where: { id: a.invoiceId, orgId: a.orgId }, include: { payments: { select: { amount: true } }, creditNotes: { select: { total: true } } } }); if (!inv) return { applied: 0 };
      const paid = inv.payments.reduce((s, x) => s + Math.round(Number(x.amount) * 100), 0), net = Math.round(Number(inv.total) * 100) - inv.creditNotes.reduce((s, x) => s + Math.round(Number(x.total) * 100), 0), amt = Math.min(a.paise, Math.max(0, net - paid));
      await tx.invoicePayLink.updateMany({ where: { id: a.linkId, orgId: a.orgId, status: "CREATED" }, data: { status: "PAID", paidAt: new Date() } });
      if (amt > 0) {
        await tx.payment.create({ data: { orgId: a.orgId, invoiceId: a.invoiceId, amount: amt / 100, method: "RAZORPAY", reference: a.paymentId, actorId: "razorpay", idempotencyKey: `rzp:${a.paymentId}` } });
        await tx.order.update({ where: { id: inv.orderId }, data: { paymentStatus: paid + amt >= net ? "PAID" : "PARTIAL" } });
      }
      if (a.paise > amt) await tx.auditLog.create({ data: { orgId: a.orgId, actorId: "razorpay", action: "invoice.overpaid_online", detail: { invoice: inv.number, paid: a.paise, recorded: amt, payment: a.paymentId } } });
      return { applied: amt };
    }).then(async (r) => { if (r.applied > 0) await emit(a.orgId, "payment.received", { invoiceId: a.invoiceId, amount: r.applied / 100, method: "RAZORPAY", reference: a.paymentId }); return r; });
  } catch (e: any) { if (e?.code === "P2002") return { applied: 0, replay: true }; throw e; }
}
