"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { usage } from "@/lib/plan"; import { PLANS } from "@/lib/plans";
import { price, methodsEnabled, PAID_PLANS } from "@/lib/billing";
import { createStripeCheckout, stripeCancelAtPeriodEnd } from "@/lib/gateways"; import { rz, RzError } from "@/lib/razorpay"; import { explainPayError, payErrorText } from "@/lib/payerrors";

const fail = (p: string, m: string): never => redirect(`${p}?e=${encodeURIComponent(m)}`);
async function owner(back: string) { const c = await ctx(); if (c.role !== "OWNER") fail(back, "Only the business owner can change the subscription"); return c; }

/** Step 1 of every payment way: record what is being bought (a PENDING row), then hand off to the right place. */
export async function startCheckout(fd: FormData) {
  const c = await owner("/subscription");
  const p = z.object({ plan: z.enum(PAID_PLANS), interval: z.enum(["MONTHLY", "YEARLY"]), method: z.enum(["RAZORPAY", "RAZORPAY_AUTO", "STRIPE", "UPI", "BANK"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("/subscription", "Choose a plan, a billing period and a payment method");
  const d = p.data, on = methodsEnabled(); if (!on[d.method]) return fail("/subscription", "That payment method isn't available right now");
  const u = await usage(c.orgId), target = PLANS[d.plan];
  if (u.productCount > target.products) return fail("/subscription", `You have ${u.productCount} active products and ${target.label} allows ${target.products}. Archive some products first.`);
  if (u.memberCount > target.members) return fail("/subscription", `You have ${u.memberCount} team members (invitations included) and ${target.label} allows ${target.members}.`);
  const pr = price(d.plan, d.interval);
  const pay = await db.subscriptionPayment.create({ data: { orgId: c.orgId, plan: d.plan, interval: d.interval, method: d.method, base: pr.base, tax: pr.tax, total: pr.total, taxPercent: pr.taxPercent, actorId: c.user.id } });
  if (d.method === "UPI" || d.method === "BANK" || d.method === "RAZORPAY" || d.method === "RAZORPAY_AUTO") redirect(`/subscription/pay/${pay.id}`); // these finish on the pay page (bank details, or the Razorpay window)
  const r = await createStripeCheckout({ paymentId: pay.id, orgId: c.orgId, paise: pr.total, plan: d.plan, planLabel: target.label, interval: d.interval, email: c.user.email }); // only Stripe is still created here
  if (!r.ok) { await db.subscriptionPayment.update({ where: { id: pay.id }, data: { status: "FAILED", note: r.error.slice(0, 200) } }); return fail("/subscription", payErrorText(r.error)); }
  await db.subscriptionPayment.update({ where: { id: pay.id }, data: { providerRef: r.data.id } });
  redirect(r.data.url);
}

/** Step 2 for UPI and bank transfer: the customer tells us the UTR / reference so an admin can match it in the bank statement. */
export async function submitReference(fd: FormData) {
  const id = String(fd.get("id")), back = `/subscription/pay/${id}`, c = await owner(back);
  const p = z.object({ reference: z.string().trim().min(6, "reference").max(40), payer: z.string().trim().max(80).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail(back, "Enter the UTR / transaction reference (6 or more characters)");
  const dup = await db.subscriptionPayment.findFirst({ where: { reference: p.data.reference, status: { in: ["PENDING", "PAID"] }, id: { not: id } } });
  if (dup) return fail(back, "That reference has already been submitted");
  const r = await db.subscriptionPayment.updateMany({ where: { id, orgId: c.orgId, status: "PENDING", method: { in: ["UPI", "BANK"] } }, data: { reference: p.data.reference, payerName: p.data.payer || null } });
  if (!r.count) return fail("/subscription", "This payment can't be updated any more");
  revalidatePath("/subscription"); redirect(`/subscription?ok=${encodeURIComponent("Thanks! We've received your reference and will activate your plan once we verify the payment.")}`);
}

export async function cancelAutoRenew(fd: FormData) {
  const c = await owner("/subscription"), resume = fd.get("resume") === "1", sub = await db.subscription.findUnique({ where: { orgId: c.orgId } });
  if (!sub?.autoRenew || (!sub.stripeSubId && !sub.razorpaySubId)) return fail("/subscription", "There's no auto-renewing subscription to change");
  if (sub.razorpaySubId) { // Razorpay can't un-cancel a subscription: to turn it back on, the customer sets up a new one
    if (resume) return fail("/subscription", "Auto-renewal with Razorpay can't be switched back on once cancelled. Choose a plan below to set it up again.");
    try { await rz(`/subscriptions/${encodeURIComponent(sub.razorpaySubId)}/cancel`, { cancel_at_cycle_end: 1 }); } catch (e: any) { return fail("/subscription", `Couldn't update the subscription: ${explainPayError(e instanceof RzError ? (e.raw as any) : e?.message).message}`); }
  } else { const r = await stripeCancelAtPeriodEnd(sub.stripeSubId!, !resume); if (!r.ok) return fail("/subscription", `Couldn't update the subscription: ${r.error}`); }
  await db.$transaction([db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: !resume } }), db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: resume ? "subscription.resumed" : "subscription.cancel_requested" } })]);
  revalidatePath("/subscription"); redirect(`/subscription?ok=${encodeURIComponent(resume ? "Auto-renewal is back on." : "Auto-renewal is off. Your plan stays active until the end of the paid period.")}`);
}

/** The payment didn't work and the customer picked another way out (pay one period instead of auto-renewal, pay monthly, bank transfer). The old attempt is closed and a fresh one is created at the right price. */
export async function switchPayment(fd: FormData) {
  const c = await owner("/subscription");
  const p = z.object({ id: z.string().min(5).max(40), method: z.enum(["RAZORPAY", "UPI", "BANK"]), interval: z.enum(["MONTHLY", "YEARLY"]).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("/subscription", "Choose a payment method");
  const old = await db.subscriptionPayment.findFirst({ where: { id: p.data.id, orgId: c.orgId, status: "PENDING" } }); if (!old) return fail("/subscription", "That payment can't be changed any more. Start again from My plan.");
  const on = methodsEnabled(); if (!on[p.data.method]) return fail("/subscription", "That payment method isn't available right now");
  const interval = (p.data.interval ?? old.interval) as "MONTHLY" | "YEARLY", pr = price(old.plan, interval);
  const made = await db.$transaction(async (tx) => {
    await tx.subscriptionPayment.updateMany({ where: { id: old.id, status: "PENDING" }, data: { status: "FAILED", note: "Switched to another payment method" } });
    return tx.subscriptionPayment.create({ data: { orgId: c.orgId, plan: old.plan, interval, method: p.data.method, base: pr.base, tax: pr.tax, total: pr.total, taxPercent: pr.taxPercent, actorId: c.user.id } });
  });
  redirect(`/subscription/pay/${made.id}`);
}
