import { db } from "@/lib/db"; import { payErrorText } from "@/lib/payerrors"; import { getStripeSession } from "@/lib/gateways"; import { activatePayment } from "@/lib/billing-server";
export const dynamic = "force-dynamic";
const go = (req: Request, q: string) => Response.redirect(new URL(`/subscription?${q}`, process.env.NEXT_PUBLIC_SITE_URL ?? req.url), 303);
/** Back from Stripe Checkout. We never trust the URL: the session is re-read from Stripe with our secret key. */
export async function GET(req: Request) {
  const sid = new URL(req.url).searchParams.get("session_id") ?? ""; if (!/^cs_[\w]+$/.test(sid)) return go(req, "e=" + encodeURIComponent("Missing payment session"));
  const r = await getStripeSession(sid); if (!r.ok) return go(req, "e=" + encodeURIComponent("We couldn't confirm the payment yet. It will be matched automatically."));
  const s = r.data, p = s.client_reference_id ? await db.subscriptionPayment.findFirst({ where: { id: String(s.client_reference_id), providerRef: sid, method: "STRIPE" } }) : null;
  if (!p) return go(req, "e=" + encodeURIComponent("Payment record not found"));
  if (s.payment_status !== "paid" || Number(s.amount_total) !== p.total) return go(req, "e=" + encodeURIComponent(payErrorText("Payment could not be completed")));
  await activatePayment(p.id, { stripeSubId: typeof s.subscription === "string" ? s.subscription : s.subscription?.id, autoRenew: true });
  return go(req, "ok=" + encodeURIComponent("Payment received. Your plan is active and will renew automatically."));
}
