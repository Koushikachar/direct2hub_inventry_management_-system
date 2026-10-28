import { db } from "@/lib/db"; import { payErrorText } from "@/lib/payerrors"; import { verifyRazorpayLink } from "@/lib/billing"; import { activatePayment } from "@/lib/billing-server";
export const dynamic = "force-dynamic";
const go = (req: Request, q: string) => Response.redirect(new URL(`/subscription?${q}`, process.env.NEXT_PUBLIC_SITE_URL ?? req.url), 303);
/** The browser lands here after paying on Razorpay's page. The signature proves the redirect is genuine; the webhook is the backup if the customer closes the tab. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams, secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const q = { linkId: u.get("razorpay_payment_link_id") ?? "", refId: u.get("razorpay_payment_link_reference_id") ?? "", status: u.get("razorpay_payment_link_status") ?? "", paymentId: u.get("razorpay_payment_id") ?? "", signature: u.get("razorpay_signature") ?? "" };
  if (!secret || !verifyRazorpayLink(q, secret)) return go(req, "e=" + encodeURIComponent("We couldn't verify that payment. If money was deducted, it will be matched automatically."));
  if (q.status !== "paid") return go(req, "e=" + encodeURIComponent(payErrorText(q.status === "expired" ? "timed out" : q.status === "cancelled" ? "cancelled" : "Payment could not be completed")));
  const p = await db.subscriptionPayment.findFirst({ where: { id: q.refId, providerRef: q.linkId, method: "RAZORPAY" } });
  if (!p) return go(req, "e=" + encodeURIComponent("Payment record not found"));
  await activatePayment(p.id, { providerPaymentId: q.paymentId });
  return go(req, "ok=" + encodeURIComponent("Payment received. Your plan is active."));
}
