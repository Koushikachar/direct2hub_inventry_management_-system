import { bearerOk } from "@/lib/cronauth";
import { db } from "@/lib/db"; import { sendMail } from "@/lib/mail"; import { esc, lapsed, GRACE_DAYS } from "@/lib/billing"; import { PLANS } from "@/lib/plans";
export const dynamic = "force-dynamic";
/** Daily job (vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`. Does three things: reminds owners 7 days before a period ends, downgrades lapsed plans to Free, tidies abandoned checkouts. */
export async function GET(req: Request) {
  if (!bearerOk(req)) return new Response("unauthorized", { status: 401 });
  const now = new Date(), soon = new Date(now.getTime() + 7 * 864e5); let reminded = 0, expired = 0;
  const due = await db.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] }, currentPeriodEnd: { lte: soon }, OR: [{ autoRenew: false }, { cancelAtPeriodEnd: true }] }, take: 500 });
  for (const s of due) {
    if (s.reminderSentFor && s.reminderSentFor.getTime() === s.currentPeriodEnd.getTime()) continue;
    const when = s.currentPeriodEnd.toLocaleDateString("en-IN"), label = PLANS[s.plan]?.label ?? s.plan;
    await db.notification.create({ data: { orgId: s.orgId, kind: "billing", title: `Your ${label} plan ends on ${when}`, body: "Renew on the My plan page to keep your higher limits.", href: "/subscription" } });
    const owners = await db.membership.findMany({ where: { orgId: s.orgId, role: "OWNER" }, include: { user: true, org: true } });
    for (const m of owners) await sendMail({ to: m.user.email, subject: `Your Direct2Hub ${label} plan ends on ${when}`, html: `<p>Hi,</p><p>The <b>${esc(label)}</b> plan for <b>${esc(m.org.name)}</b> ends on ${when}. After a ${GRACE_DAYS}-day grace period your account returns to the Free plan limits (your data is kept).</p><p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/subscription">Renew now</a></p>` });
    await db.subscription.update({ where: { id: s.id }, data: { reminderSentFor: s.currentPeriodEnd } }); reminded++;
  }
  const live = await db.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE", "CANCELLED"] }, currentPeriodEnd: { lt: now } }, take: 500 });
  for (const s of live.filter((x) => lapsed(x.currentPeriodEnd, now.getTime()))) {
    await db.$transaction([db.subscription.update({ where: { id: s.id }, data: { status: "EXPIRED", autoRenew: false } }), db.organization.update({ where: { id: s.orgId }, data: { plan: "FREE" } }),
      db.notification.create({ data: { orgId: s.orgId, kind: "billing", title: "Your plan has ended", body: "You're back on the Free plan. Your data is safe; renew to restore your limits.", href: "/subscription" } }),
      db.auditLog.create({ data: { orgId: s.orgId, actorId: "system", action: "subscription.expired", detail: { plan: s.plan } } })]); expired++;
  }
  const g = await db.subscriptionPayment.updateMany({ where: { status: "PENDING", method: { in: ["RAZORPAY", "RAZORPAY_AUTO", "STRIPE"] }, createdAt: { lt: new Date(now.getTime() - 3 * 864e5) } }, data: { status: "FAILED", note: "Abandoned checkout" } });
  const m = await db.subscriptionPayment.updateMany({ where: { status: "PENDING", method: { in: ["UPI", "BANK"] }, reference: null, createdAt: { lt: new Date(now.getTime() - 7 * 864e5) } }, data: { status: "FAILED", note: "No reference submitted" } });
  return Response.json({ reminded, expired, abandoned: g.count + m.count });
}
