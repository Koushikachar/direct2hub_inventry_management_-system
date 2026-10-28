import { db } from "@/lib/db"; import { verifyRazorpayWebhook } from "@/lib/billing"; import { activatePayment, recordRazorpayRenewal, recordRazorpayEnded } from "@/lib/billing-server"; import { explainPayError } from "@/lib/payerrors";
export const dynamic = "force-dynamic";
/** Razorpay dashboard -> Webhooks: URL <site>/api/billing/razorpay/webhook, secret = RAZORPAY_WEBHOOK_SECRET.
 *  Events: payment_link.paid, payment.captured, order.paid, payment.failed, subscription.charged, subscription.cancelled, subscription.halted, subscription.completed.
 *  This is the safety net for customers who pay and then close the tab before our page hears about it. Every branch is idempotent. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"), process.env.RAZORPAY_WEBHOOK_SECRET ?? "")) return new Response("bad signature", { status: 400 });
  let ev: any; try { ev = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const pay = ev?.payload?.payment?.entity, sub = ev?.payload?.subscription?.entity, link = ev?.payload?.payment_link?.entity;
  switch (ev?.event) {
    case "payment_link.paid": { // older hosted-link payments
      const p = link?.reference_id ? await db.subscriptionPayment.findFirst({ where: { id: String(link.reference_id), providerRef: String(link.id), method: "RAZORPAY" } }) : null;
      if (!p) return Response.json({ ok: true, unmatched: true }); // 200 so Razorpay doesn't retry forever for payments that aren't ours
      if (Number(link.amount_paid) !== p.total) { console.error("razorpay amount mismatch", p.id); return Response.json({ ok: true, mismatch: true }); }
      await activatePayment(p.id, { providerPaymentId: pay?.id ? String(pay.id) : undefined }); break; }
    case "payment.captured": case "order.paid": { // in-page checkout, one period
      const orderId = pay?.order_id ?? ev?.payload?.order?.entity?.id, paid = Number(pay?.amount ?? ev?.payload?.order?.entity?.amount_paid);
      const p = orderId ? await db.subscriptionPayment.findFirst({ where: { providerRef: String(orderId), method: "RAZORPAY" } }) : null;
      if (!p) return Response.json({ ok: true, unmatched: true });
      if (paid !== p.total) { console.error("razorpay amount mismatch", p.id); return Response.json({ ok: true, mismatch: true }); }
      await activatePayment(p.id, { providerPaymentId: pay?.id ? String(pay.id) : undefined }); break; }
    case "subscription.charged": { // first charge and every renewal
      if (!sub?.id || !pay?.id) break;
      const p = await db.subscriptionPayment.findFirst({ where: { providerRef: String(sub.id), method: "RAZORPAY_AUTO", status: { in: ["PENDING", "FAILED"] } } });
      if (p) { if (Number(pay.amount) !== p.total) { console.error("razorpay amount mismatch", p.id); break; } await activatePayment(p.id, { providerPaymentId: String(pay.id), razorpaySubId: String(sub.id), autoRenew: true }); }
      else await recordRazorpayRenewal(String(sub.id), String(pay.id), Number(pay.amount), Number(sub.current_end) || undefined);
      break; }
    case "subscription.cancelled": case "subscription.halted": case "subscription.completed":
      if (sub?.id) await recordRazorpayEnded(String(sub.id), String(ev.event).split(".")[1] as "cancelled" | "halted" | "completed"); break;
    case "payment.failed": { // keep a friendly reason on the open payment; the customer can still retry in the same window
      const orderId = pay?.order_id, p = orderId ? await db.subscriptionPayment.findFirst({ where: { providerRef: String(orderId), status: "PENDING" } }) : null;
      if (p) await db.subscriptionPayment.update({ where: { id: p.id }, data: { note: explainPayError({ code: pay?.error_code, description: pay?.error_description, reason: pay?.error_reason }).title.slice(0, 200) } }); break; }
    default: return Response.json({ ok: true, ignored: true });
  }
  return Response.json({ ok: true });
}
