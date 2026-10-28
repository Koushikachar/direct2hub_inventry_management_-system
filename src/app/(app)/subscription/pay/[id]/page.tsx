import SubmitButton from "@/components/SubmitButton";
import Link from "next/link"; import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell"; import { Err, Panel, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { PLANS } from "@/lib/plans"; import { bankDetails, upiLink, rupees, methodsEnabled } from "@/lib/billing"; import { submitReference } from "../../actions"; import RazorpayCheckout from "@/components/RazorpayCheckout"; import { payErrorText } from "@/lib/payerrors";
export const dynamic = "force-dynamic";
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex flex-wrap justify-between gap-2 py-1.5"><dt className="text-ink/60">{k}</dt><dd className="select-all font-semibold">{v}</dd></div>;
export default async function PayManually({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const c = await ctx(), { id } = await params, { e } = await searchParams;
  const p = await db.subscriptionPayment.findFirst({ where: { id, orgId: c.orgId, method: { in: ["UPI", "BANK", "RAZORPAY", "RAZORPAY_AUTO"] } } }); if (!p) notFound();
  if (p.method === "RAZORPAY" || p.method === "RAZORPAY_AUTO") {
    const auto = p.method === "RAZORPAY_AUTO", on = methodsEnabled(), open = p.status === "PENDING" && !(p.providerRef ?? "").startsWith("plink_"), name = PLANS[p.plan]?.label ?? p.plan, per = p.interval === "YEARLY" ? "1 year" : "1 month";
    return <Shell title={auto ? "Set up auto-renewal" : "Pay with Razorpay"}><Err e={e} /><Link href="/subscription" className="text-sm text-brand underline">← My plan</Link>
      <Panel title={`${name} plan, ${per}: ${rupees(p.total)}`}>
        {open ? <><p className="mb-4 text-sm text-ink/70">{auto ? "You'll be charged now and then automatically every " + (p.interval === "YEARLY" ? "year" : "month") + ". Use a card that allows recurring payments, or UPI AutoPay. You can cancel any time from My plan." : "Pay with UPI, card, netbanking or wallet. This pays for one period and we remind you before it ends."}</p>
          <RazorpayCheckout paymentId={p.id} mode={auto ? "auto" : "once"} interval={p.interval === "YEARLY" ? "YEARLY" : "MONTHLY"} amountLabel={rupees(p.total)} enabled={{ razorpay: on.RAZORPAY, upi: on.UPI, bank: on.BANK }} />
          <p className="mt-4 text-xs text-ink/60">Secure payment by Razorpay. Your card details never reach our servers. Your plan switches on as soon as the payment is confirmed.</p></>
        : <><p className="text-sm">{p.status === "PAID" ? "Paid and active." : p.status === "PENDING" ? "This payment was started with an older payment link. Go back to My plan and start it again." : p.note ? `This payment didn't go through: ${p.note}.` : "This payment is closed."}</p><Link href="/subscription" className={`${ghost} mt-3 inline-flex items-center`}>Back to My plan</Link></>}
      </Panel></Shell>;
  }
  const b = bankDetails(), upi = p.method === "UPI", note = `D2H ${id.slice(-8)}`, open = p.status === "PENDING" && !p.reference, label = `${PLANS[p.plan]?.label ?? p.plan} plan, ${p.interval === "YEARLY" ? "1 year" : "1 month"}`;
  return <Shell title={upi ? "Pay by UPI" : "Pay by bank transfer"}><Err e={e} /><Link href="/subscription" className="text-sm text-brand underline">← My plan</Link>
    <Panel title={`${label}: ${rupees(p.total)}`}>
      <dl className="divide-y divide-white/70 text-sm">{upi ? <><Row k="UPI ID" v={b.upi} /><Row k="Payee name" v={b.upiName} /></> : <><Row k="Account name" v={b.name} /><Row k="Bank" v={b.bank} /><Row k="Account number" v={b.account} /><Row k="IFSC" v={b.ifsc} /></>}
        <Row k="Amount (exact)" v={rupees(p.total)} /><Row k="Remarks / note" v={note} /></dl>
      {upi && open && <a href={upiLink({ vpa: b.upi, name: b.upiName, paise: p.total, note })} className={`${btn} mt-4 inline-flex items-center`}>Open my UPI app (phone)</a>}
      <p className="mt-3 text-xs text-ink/60">Pay the exact amount, put the note in the remarks, then send us the {upi ? "UTR / UPI reference" : "bank reference (UTR)"} below. Most payments are verified within a few business hours.</p></Panel>
    {open ? <Panel title="I've paid: send the reference"><form action={submitReference} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="id" value={p.id} />
      <label className="text-sm">{upi ? "UTR / UPI reference" : "Bank reference (UTR)"}<input name="reference" required minLength={6} maxLength={40} className={inp} /></label>
      <label className="text-sm">Name on the payment (optional)<input name="payer" maxLength={80} className={inp} /></label><div className="self-end"><SubmitButton className={`${btn} w-full`}>Submit for verification</SubmitButton></div></form></Panel>
    : <Panel title="Status"><p className="text-sm">{p.status === "PAID" ? "Paid and active." : p.status === "REJECTED" ? `Rejected${p.note ? `: ${p.note}` : ""}. Contact us if this is a mistake.` : p.status === "PENDING" ? `Reference ${p.reference} received. We're verifying it.` : "This payment is closed."}</p><Link href="/subscription" className={`${ghost} mt-3 inline-flex items-center`}>Back</Link></Panel>}</Shell>;
}
