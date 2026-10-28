import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { Shell, Stat } from "@/components/Shell"; import { Err, Panel, Table, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { usage } from "@/lib/plan"; import { PLANS } from "@/lib/plans";
import { price, methodsEnabled, taxPercent, lapsed, rupees, receiptNo, PAID_PLANS, METHOD_LABEL, METHOD_HINT, METHOD_SHORT, GRACE_DAYS, type Method } from "@/lib/billing";
import { startCheckout, cancelAutoRenew } from "./actions";
export const dynamic = "force-dynamic";
const ORDER: Method[] = ["RAZORPAY", "RAZORPAY_AUTO", "STRIPE", "UPI", "BANK"];
const tone: Record<string, string> = { PAID: "bg-brand/15 text-brand", PENDING: "bg-turmeric/25 text-ink", FAILED: "bg-danger/15 text-danger", REJECTED: "bg-danger/15 text-danger" };
export default async function Subscription({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string; i?: string }> }) {
  const c = await ctx(), { e, ok, i } = await searchParams, yearly = i === "YEARLY", interval = yearly ? "YEARLY" : "MONTHLY", isOwner = c.role === "OWNER";
  const [u, hist] = await Promise.all([usage(c.orgId), db.subscriptionPayment.findMany({ where: { orgId: c.orgId }, orderBy: { createdAt: "desc" }, take: 30 })]);
  const sub = u.subscription, on = methodsEnabled(), methods = ORDER.filter((m) => on[m]), pct = taxPercent();
  const ends = sub?.currentPeriodEnd, over = !!ends && ends < new Date(), dropped = !!sub && lapsed(sub.currentPeriodEnd);
  const status = !sub ? "Set by admin / Free" : dropped ? "Expired" : over ? `In grace period (${GRACE_DAYS} days)` : sub.status === "PAST_DUE" ? "Payment failed" : sub.cancelAtPeriodEnd ? "Ends at period end" : "Active";
  return <Shell title="My plan"><Err e={e} />{ok && <p role="status" className="glass px-4 py-2 text-sm text-brand">{ok}</p>}
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"><Stat label="Current plan" value={u.label} /><Stat label="Status" value={status} tone={dropped || over ? "warn" : "brand"} />
      <Stat label={sub?.autoRenew && !sub.cancelAtPeriodEnd ? "Renews on" : "Paid until"} value={ends ? ends.toLocaleDateString("en-IN") : "—"} hint={sub?.autoRenew ? (sub.cancelAtPeriodEnd ? "Auto-renewal is off" : "Renews automatically") : sub ? "Renew before this date" : undefined} />
      <Stat label="Usage" value={`${u.productCount}/${u.products}`} hint={`products · ${u.memberCount}/${u.members} team members`} /></div>
    {sub?.autoRenew && isOwner && <Panel title="Auto-renewal"><form action={cancelAutoRenew} className="flex flex-wrap items-center gap-3 text-sm">{sub.cancelAtPeriodEnd ? <><input type="hidden" name="resume" value="1" /><span>Auto-renewal is off. Your plan ends on {ends?.toLocaleDateString("en-IN")}.</span>{sub.razorpaySubId ? <span className="text-ink/60">To turn it on again, choose a plan below.</span> : <SubmitButton className={ghost}>Turn auto-renewal back on</SubmitButton>}</>
      : <><span>Your payment method is charged automatically each period.</span><SubmitButton className={ghost}>Cancel auto-renewal</SubmitButton></>}</form></Panel>}
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Choose a plan</h2>
      <div className="glass flex gap-1 p-1.5" role="group" aria-label="Billing period">{[["MONTHLY", "Monthly"], ["YEARLY", "Yearly · 2 months free"]].map(([k, l]) => <Link key={k} href={`/subscription?i=${k}`} className={`rounded-xl px-3 py-1.5 text-sm transition ${interval === k ? "bg-ink text-white" : "hover:bg-white/60"}`}>{l}</Link>)}</div></div>
    {!methods.length && isOwner && <p className="glass p-4 text-sm">Online payment isn't switched on yet. The platform admin needs to add Razorpay, Stripe, UPI or bank details in the server settings.</p>}
    <div className="grid gap-4 lg:grid-cols-3">
      {["FREE", ...PAID_PLANS].map((k) => { const p = PLANS[k], cur = u.plan === k, pr = k === "FREE" ? null : price(k, interval, pct), per = yearly ? "year" : "month";
        return <section key={k} className={`glass flex flex-col p-5 ${cur ? "ring-2 ring-brand" : ""}`}><div className="flex items-center justify-between"><h3 className="text-lg font-bold">{p.label}</h3>{cur && <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-white">Current</span>}</div>
          <p className="mt-2 text-3xl font-extrabold tabular-nums">{pr ? rupees(pr.base).replace(".00", "") : "₹0"}<span className="text-sm font-normal text-ink/60"> / {pr ? per : "forever"}</span></p>
          {pr && pr.tax > 0 && <p className="text-xs text-ink/60">+ {pct}% GST = {rupees(pr.total)}</p>}
          <ul className="mt-3 space-y-1 text-sm"><li>Up to {p.products.toLocaleString("en-IN")} products</li><li>Up to {p.members} team members</li><li>Orders, GST invoices, bills, reports</li></ul>
          <div className="mt-auto pt-4">{!pr ? <p className="text-xs text-ink/60">Your account returns to Free if a paid plan isn't renewed.</p> : !isOwner ? <p className="text-xs text-ink/60">Only the owner can change the plan.</p> : !methods.length ? null :
            <form action={startCheckout} className="space-y-3"><input type="hidden" name="plan" value={k} /><input type="hidden" name="interval" value={interval} />
              <fieldset className="space-y-1.5"><legend className="mb-1 text-xs uppercase tracking-wide text-ink/60">Pay with</legend>{methods.map((m, n) => <label key={m} className="flex cursor-pointer gap-2 rounded-xl border border-white/70 bg-white/50 p-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-white/90">
                <input type="radio" name="method" value={m} defaultChecked={n === 0} className="mt-1" /><span><span className="font-medium">{METHOD_LABEL[m]}</span><span className="block text-xs text-ink/60">{METHOD_HINT[m]}</span></span></label>)}</fieldset>
              <SubmitButton className={`${btn} w-full`}>{cur ? "Renew" : u.plan !== "FREE" && PLANS[u.plan].monthly > p.monthly ? "Switch to" : "Upgrade to"} {p.label}</SubmitButton></form>}</div></section>; })}</div>
    <p className="text-xs text-ink/60">Changing plan starts a fresh period from the day you pay. Renewing the same plan adds time to your current period. Prices are in ₹{pct ? `, GST at ${pct}% added at checkout` : ""}.</p>
    <h2 className="font-semibold">Payment history</h2>
    <Table head={["Date", "Plan", "Method", "Amount", "Status", "Receipt"]} empty="No payments yet." rows={hist.map((h) => [h.createdAt.toLocaleDateString("en-IN"), `${PLANS[h.plan]?.label ?? h.plan} · ${h.interval === "YEARLY" ? "yearly" : "monthly"}`, METHOD_SHORT[h.method] ?? h.method, rupees(h.total),
      <span key="s" className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[h.status]}`}>{h.status === "PENDING" && h.reference ? "Verifying" : h.status.toLowerCase()}</span>,
      h.status === "PAID" ? <Link key="r" href={`/subscription/receipt/${h.id}`} className="text-brand underline">{receiptNo(h.number)}</Link> : h.status === "PENDING" && (h.method === "UPI" || h.method === "BANK" || h.method === "RAZORPAY" || h.method === "RAZORPAY_AUTO") && !h.reference && !(h.providerRef ?? "").startsWith("plink_") ? <Link key="r" href={`/subscription/pay/${h.id}`} className="text-brand underline">{h.note ? "Try again" : "Complete payment"}</Link> : h.note ?? "—"])} /></Shell>;
}
