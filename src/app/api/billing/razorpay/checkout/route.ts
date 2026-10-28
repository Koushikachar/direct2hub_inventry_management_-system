import { z } from "zod";
import { db } from "@/lib/db"; import { PLANS } from "@/lib/plans"; import { rz, RzError, razorpayConfigured, razorpayPlanFor, totalCount } from "@/lib/razorpay";
import { ownerOrError } from "@/lib/rzauth"; import { allow } from "@/lib/ratelimit"; import { explainPayError } from "@/lib/payerrors"; import type { Interval } from "@/lib/billing";
export const dynamic = "force-dynamic";
/** Starts a Razorpay payment for a PENDING SubscriptionPayment the owner already created. The price comes from our own row, never from the browser.
 *  RAZORPAY -> a one-time order (UPI, cards, netbanking, wallets). RAZORPAY_AUTO -> a subscription (card / UPI AutoPay). The plan switches on only after /verify or the webhook confirms the payment. */
export async function POST(req: Request) {
  if (!razorpayConfigured()) return Response.json({ error: "Razorpay isn't set up yet" }, { status: 503 });
  const c = await ownerOrError(req); if (c instanceof Response) return c;
  if (!(await allow(`rzp-checkout:${c.orgId}`, 20, 3600_000))) return Response.json({ error: "Too many attempts. Please try again in a while." }, { status: 429 });
  const b = z.object({ paymentId: z.string().min(5).max(40) }).safeParse(await req.json().catch(() => null)); if (!b.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const p = await db.subscriptionPayment.findFirst({ where: { id: b.data.paymentId, orgId: c.orgId, status: "PENDING", method: { in: ["RAZORPAY", "RAZORPAY_AUTO"] } } });
  if (!p) return Response.json({ error: "This payment can't be started any more. Go back to My plan and choose again." }, { status: 404 });
  const label = PLANS[p.plan]?.label ?? p.plan, interval = p.interval as Interval, desc = `${label} plan, ${interval === "YEARLY" ? "1 year" : "1 month"}`, prefill = { name: c.user.name ?? c.orgName, email: c.user.email };
  try {
    if (p.method === "RAZORPAY") {
      let orderId = p.providerRef && p.providerRef.startsWith("order_") ? p.providerRef : "";
      if (!orderId) { const o = await rz("/orders", { amount: p.total, currency: "INR", receipt: `d2h_${p.id}`.slice(0, 40), notes: { paymentId: p.id, orgId: c.orgId, plan: p.plan, interval } }); orderId = String(o.id); await db.subscriptionPayment.update({ where: { id: p.id }, data: { providerRef: orderId } }); }
      return Response.json({ mode: "once", keyId: process.env.RAZORPAY_KEY_ID, orderId, amount: p.total, currency: "INR", description: desc, prefill });
    }
    let subId = p.providerRef && p.providerRef.startsWith("sub_") ? p.providerRef : "";
    if (!subId) {
      const planId = await razorpayPlanFor(p.plan, interval, p.total, label);
      const s = await rz("/subscriptions", { plan_id: planId, total_count: totalCount(interval), quantity: 1, customer_notify: 1, notes: { paymentId: p.id, orgId: c.orgId, plan: p.plan, interval } });
      subId = String(s.id); await db.subscriptionPayment.update({ where: { id: p.id }, data: { providerRef: subId } });
    }
    return Response.json({ mode: "auto", keyId: process.env.RAZORPAY_KEY_ID, subscriptionId: subId, description: `${desc}, renews automatically`, prefill });
  } catch (e: any) {
    const info = explainPayError(e instanceof RzError ? (e.raw as any) : e?.message);
    return Response.json({ error: `${info.title}. ${info.message}`, info }, { status: e instanceof RzError && e.status < 500 ? 422 : 502 });
  }
}
