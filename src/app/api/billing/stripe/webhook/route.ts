import { db } from "@/lib/db"; import { verifyStripeSignature } from "@/lib/billing"; import { activatePayment, recordStripeRenewal } from "@/lib/billing-server";
export const dynamic = "force-dynamic";
/** Stripe dashboard -> Webhooks: URL <site>/api/billing/stripe/webhook; events checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET ?? "")) return new Response("bad signature", { status: 400 });
  let ev: any; try { ev = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const o = ev?.data?.object ?? {}, subId = (v: any) => (typeof v === "string" ? v : v?.id) as string | undefined;
  switch (ev?.type) {
    case "checkout.session.completed": {
      const p = o.client_reference_id ? await db.subscriptionPayment.findFirst({ where: { id: String(o.client_reference_id), providerRef: String(o.id), method: "STRIPE" } }) : null;
      if (p && o.payment_status === "paid" && Number(o.amount_total) === p.total) await activatePayment(p.id, { stripeSubId: subId(o.subscription), autoRenew: true });
      break; }
    case "invoice.paid": // first invoice is handled by checkout.session.completed; only later cycles are renewals
      if (o.billing_reason === "subscription_cycle" && subId(o.subscription)) await recordStripeRenewal(subId(o.subscription)!, String(o.id), Number(o.amount_paid), o.lines?.data?.[0]?.period?.end);
      break;
    case "invoice.payment_failed": {
      const s = subId(o.subscription) ? await db.subscription.findUnique({ where: { stripeSubId: subId(o.subscription)! } }) : null;
      if (s) { await db.subscription.update({ where: { id: s.id }, data: { status: "PAST_DUE" } });
        await db.notification.create({ data: { orgId: s.orgId, kind: "billing", title: "Subscription payment failed", body: "We couldn't charge your card. Update it or pay another way before your plan lapses.", href: "/subscription" } }); }
      break; }
    case "customer.subscription.updated": { const s = await db.subscription.findUnique({ where: { stripeSubId: String(o.id) } }); if (s) await db.subscription.update({ where: { id: s.id }, data: { cancelAtPeriodEnd: !!o.cancel_at_period_end } }); break; }
    case "customer.subscription.deleted": { const s = await db.subscription.findUnique({ where: { stripeSubId: String(o.id) } }); if (s) await db.subscription.update({ where: { id: s.id }, data: { autoRenew: false, cancelAtPeriodEnd: false, status: "CANCELLED" } }); break; }
  }
  return Response.json({ received: true });
}
