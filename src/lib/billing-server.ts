import { db } from "./db"; import { addPeriod, rupees, type Interval } from "./billing"; import { PLANS } from "./plans";

/** Marks one payment PAID and switches the plan on. The claim (PENDING/FAILED -> PAID) is atomic, so webhooks, redirects and admin clicks can all race safely: only one wins, the rest are no-ops. */
export async function activatePayment(id: string, x: { providerPaymentId?: string; stripeSubId?: string; razorpaySubId?: string; autoRenew?: boolean; periodEnd?: Date } = {}) {
  const r = await db.$transaction(async (tx) => {
    const now = new Date(), claim = await tx.subscriptionPayment.updateMany({ where: { id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "PAID", paidAt: now, ...(x.providerPaymentId ? { providerPaymentId: x.providerPaymentId } : {}) } });
    if (claim.count !== 1) return null;
    const p = await tx.subscriptionPayment.findUniqueOrThrow({ where: { id } }), sub = await tx.subscription.findUnique({ where: { orgId: p.orgId } });
    const renewing = !!sub && sub.plan === p.plan && sub.currentPeriodEnd > now, start = renewing ? sub!.currentPeriodEnd : now, end = x.periodEnd ?? addPeriod(start, p.interval as Interval);
    const data = { plan: p.plan, interval: p.interval, status: "ACTIVE" as const, currentPeriodEnd: end, autoRenew: !!x.autoRenew, cancelAtPeriodEnd: false, stripeSubId: x.stripeSubId ?? null, razorpaySubId: x.razorpaySubId ?? null, reminderSentFor: null };
    await tx.subscription.upsert({ where: { orgId: p.orgId }, create: { orgId: p.orgId, ...data }, update: data });
    await tx.organization.update({ where: { id: p.orgId }, data: { plan: p.plan } });
    await tx.subscriptionPayment.update({ where: { id }, data: { periodStart: start, periodEnd: end } });
    await tx.notification.create({ data: { orgId: p.orgId, kind: "billing", title: `${PLANS[p.plan]?.label ?? p.plan} plan active until ${end.toLocaleDateString("en-IN")}`, body: `Payment of ${rupees(p.total)} received.`, href: `/subscription/receipt/${id}` } });
    await tx.auditLog.create({ data: { orgId: p.orgId, actorId: p.actorId, action: "subscription.paid", detail: { payment: id, method: p.method, plan: p.plan, total: p.total } } });
    return p.orgId;
  }, { timeout: 15000 });
  if (r) await assignReceiptNumber(id);
  return { activated: !!r, orgId: r };
}
/** Sequential receipt numbers. Done after the main transaction so a rare number clash can retry without undoing the activation. */
export async function assignReceiptNumber(id: string) {
  for (let i = 0; i < 5; i++) {
    try {
      const cur = await db.subscriptionPayment.findUnique({ where: { id }, select: { number: true } }); if (!cur || cur.number) return;
      const last = await db.subscriptionPayment.aggregate({ _max: { number: true } });
      await db.subscriptionPayment.updateMany({ where: { id, number: null }, data: { number: (last._max.number ?? 0) + 1 } }); return;
    } catch (e: any) { if (e?.code !== "P2002") { console.error("receipt number failed", e?.message); return; } }
  }
}
/** Stripe renewal (invoice.paid for an existing subscription). Idempotent on the Stripe invoice id. */
export async function recordStripeRenewal(stripeSubId: string, invoiceId: string, paidPaise: number, periodEndUnix?: number) {
  const sub = await db.subscription.findUnique({ where: { stripeSubId } }); if (!sub) return { ok: false as const, error: "unknown subscription" };
  if (await db.subscriptionPayment.findUnique({ where: { providerPaymentId: invoiceId } })) return { ok: true as const, replay: true };
  const { price } = await import("./billing"), pr = price(sub.plan, sub.interval as Interval, 0), pct = paidPaise > pr.base ? Math.round(((paidPaise - pr.base) / pr.base) * 100) : 0;
  const now = new Date(), end = periodEndUnix ? new Date(periodEndUnix * 1000) : addPeriod(sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now, sub.interval as Interval);
  try {
    const p = await db.$transaction(async (tx) => {
      const pay = await tx.subscriptionPayment.create({ data: { orgId: sub.orgId, plan: sub.plan, interval: sub.interval, method: "STRIPE", status: "PAID", base: pr.base, tax: paidPaise - pr.base, total: paidPaise, taxPercent: pct, providerPaymentId: invoiceId, actorId: "stripe", paidAt: now, periodStart: sub.currentPeriodEnd, periodEnd: end } });
      await tx.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", currentPeriodEnd: end, reminderSentFor: null } });
      await tx.organization.update({ where: { id: sub.orgId }, data: { plan: sub.plan } });
      await tx.notification.create({ data: { orgId: sub.orgId, kind: "billing", title: `Subscription renewed until ${end.toLocaleDateString("en-IN")}`, body: `Card charged ${rupees(paidPaise)}.`, href: `/subscription/receipt/${pay.id}` } });
      return pay;
    }); await assignReceiptNumber(p.id); return { ok: true as const, replay: false };
  } catch (e: any) { if (e?.code === "P2002") return { ok: true as const, replay: true }; throw e; }
}
/** Razorpay AutoPay renewal (subscription.charged for an existing subscription). Idempotent on the Razorpay payment id, so the checkout page, the webhook and a retry can all report the same charge safely. */
export async function recordRazorpayRenewal(razorpaySubId: string, razorpayPaymentId: string, paidPaise: number, periodEndUnix?: number) {
  const sub = await db.subscription.findUnique({ where: { razorpaySubId } }); if (!sub) return { ok: false as const, error: "unknown subscription" };
  if (await db.subscriptionPayment.findUnique({ where: { providerPaymentId: razorpayPaymentId } })) return { ok: true as const, replay: true };
  const { price } = await import("./billing"), pr = price(sub.plan, sub.interval as Interval, 0), pct = paidPaise > pr.base ? Math.round(((paidPaise - pr.base) / pr.base) * 100) : 0;
  const now = new Date(), end = periodEndUnix ? new Date(periodEndUnix * 1000) : addPeriod(sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now, sub.interval as Interval);
  try {
    const p = await db.$transaction(async (tx) => {
      const pay = await tx.subscriptionPayment.create({ data: { orgId: sub.orgId, plan: sub.plan, interval: sub.interval, method: "RAZORPAY_AUTO", status: "PAID", base: pr.base, tax: Math.max(0, paidPaise - pr.base), total: paidPaise, taxPercent: pct, providerPaymentId: razorpayPaymentId, actorId: "razorpay", paidAt: now, periodStart: sub.currentPeriodEnd, periodEnd: end } });
      await tx.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", currentPeriodEnd: end, autoRenew: true, reminderSentFor: null } });
      await tx.organization.update({ where: { id: sub.orgId }, data: { plan: sub.plan } });
      await tx.notification.create({ data: { orgId: sub.orgId, kind: "billing", title: `Subscription renewed until ${end.toLocaleDateString("en-IN")}`, body: `Auto-renewal charged ${rupees(paidPaise)}.`, href: `/subscription/receipt/${pay.id}` } });
      return pay;
    }); await assignReceiptNumber(p.id); return { ok: true as const, replay: false };
  } catch (e: any) { if (e?.code === "P2002") return { ok: true as const, replay: true }; throw e; }
}
/** Razorpay stopped charging (cancelled, halted after failed charges, or all cycles completed). The plan stays until the paid period ends. */
export async function recordRazorpayEnded(razorpaySubId: string, how: "cancelled" | "halted" | "completed") {
  const sub = await db.subscription.findUnique({ where: { razorpaySubId } }); if (!sub) return;
  await db.$transaction([
    db.subscription.update({ where: { id: sub.id }, data: { autoRenew: false, cancelAtPeriodEnd: how === "cancelled", ...(how === "halted" ? { status: "PAST_DUE" as const } : {}) } }),
    db.notification.create({ data: { orgId: sub.orgId, kind: "billing", title: how === "halted" ? "Auto-renewal payment failed" : "Auto-renewal is off", body: how === "halted" ? "Your bank declined the automatic payment several times. Pay for the next period on My plan to keep your plan." : `Your plan stays active until ${sub.currentPeriodEnd.toLocaleDateString("en-IN")}.`, href: "/subscription" } })]);
}
