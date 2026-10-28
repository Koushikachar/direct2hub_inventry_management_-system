import { z } from "zod";
import { db } from "@/lib/db"; import { verifyRazorpayOrder, verifyRazorpaySubscription } from "@/lib/billing"; import { activatePayment } from "@/lib/billing-server"; import { ownerOrError } from "@/lib/rzauth"; import { allow } from "@/lib/ratelimit";
export const dynamic = "force-dynamic";
const Once = z.object({ razorpay_order_id: z.string().min(5).max(60), razorpay_payment_id: z.string().min(5).max(60), razorpay_signature: z.string().min(10).max(200) });
const Sub = z.object({ razorpay_subscription_id: z.string().min(5).max(60), razorpay_payment_id: z.string().min(5).max(60), razorpay_signature: z.string().min(10).max(200) });
/** Called by the browser right after Razorpay says "paid". We don't take the browser's word for it: the signature is checked with our secret, and the payment must be ours. */
export async function POST(req: Request) {
  const c = await ownerOrError(req); if (c instanceof Response) return c;
  if (!(await allow(`rzp-verify:${c.orgId}`, 30, 3600_000))) return Response.json({ error: "Too many attempts" }, { status: 429 });
  const secret = process.env.RAZORPAY_KEY_SECRET, raw = await req.json().catch(() => null); if (!secret) return Response.json({ error: "Razorpay isn't set up yet" }, { status: 503 });
  const wait = "We couldn't confirm the payment yet. If money was deducted, your plan will switch on automatically within a few minutes.";
  const sub = Sub.safeParse(raw);
  if (sub.success) {
    const d = sub.data, p = await db.subscriptionPayment.findFirst({ where: { providerRef: d.razorpay_subscription_id, orgId: c.orgId, method: "RAZORPAY_AUTO" } }); if (!p) return Response.json({ error: "Payment not found" }, { status: 404 });
    if (!verifyRazorpaySubscription(d.razorpay_payment_id, d.razorpay_subscription_id, d.razorpay_signature, secret)) return Response.json({ error: wait }, { status: 400 });
    await activatePayment(p.id, { providerPaymentId: d.razorpay_payment_id, razorpaySubId: d.razorpay_subscription_id, autoRenew: true }); return Response.json({ ok: true });
  }
  const once = Once.safeParse(raw); if (!once.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const d = once.data, p = await db.subscriptionPayment.findFirst({ where: { providerRef: d.razorpay_order_id, orgId: c.orgId, method: "RAZORPAY" } }); if (!p) return Response.json({ error: "Payment not found" }, { status: 404 });
  if (!verifyRazorpayOrder(d.razorpay_order_id, d.razorpay_payment_id, d.razorpay_signature, secret)) return Response.json({ error: wait }, { status: 400 });
  await activatePayment(p.id, { providerPaymentId: d.razorpay_payment_id }); return Response.json({ ok: true });
}
