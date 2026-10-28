"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { btn, ghost } from "./ui";
import { explainPayError, type PayErrorInfo, type PayFallback } from "@/lib/payerrors";
import { switchPayment } from "@/app/(app)/subscription/actions";
declare global { interface Window { Razorpay?: any } }
const loadCheckout = () => new Promise<void>((res, rej) => {
  if (window.Razorpay) return res();
  const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error("Couldn't load the Razorpay payment window. Turn off ad blockers for this page or try another payment method."));
  document.body.appendChild(s);
});
type Props = { paymentId: string; mode: "once" | "auto"; interval: "MONTHLY" | "YEARLY"; amountLabel: string; enabled: { razorpay: boolean; upi: boolean; bank: boolean } };

/** Opens Razorpay Checkout for a payment that was already recorded on the server. A failed attempt is explained in plain language, with the next sensible step as a button
 *  (pay one period instead of auto-renewal, pay monthly, bank transfer, try again). The plan only switches on after the server verifies the payment. */
export default function RazorpayCheckout({ paymentId, mode, interval, amountLabel, enabled }: Props) {
  const router = useRouter(), [busy, setBusy] = useState(false), [fail, setFail] = useState<PayErrorInfo | null>(null), [msg, setMsg] = useState(""), failed = useRef(false);
  const report = (error: unknown) => { void fetch("/api/billing/razorpay/failed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentId, error }) }).catch(() => {}); };
  async function start() {
    setBusy(true); setFail(null); setMsg(""); failed.current = false;
    try {
      const r = await fetch("/api/billing/razorpay/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentId }) }), o = await r.json().catch(() => ({}));
      if (!r.ok) { if (o.info) setFail(o.info); else setMsg(o.error ?? "Couldn't start the payment. Please try again."); setBusy(false); return; }
      await loadCheckout();
      const rzp = new window.Razorpay({
        key: o.keyId, name: "Direct2Hub", description: o.description, prefill: o.prefill, theme: { color: "#0F766E" }, retry: { enabled: true, max_count: 3 },
        ...(o.mode === "auto" ? { subscription_id: o.subscriptionId } : { order_id: o.orderId, amount: o.amount, currency: o.currency }),
        handler: async (resp: Record<string, string>) => {
          setMsg("Confirming your payment…");
          const v = await fetch("/api/billing/razorpay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resp) }), j = await v.json().catch(() => ({}));
          if (v.ok) { router.push(`/subscription?ok=${encodeURIComponent(o.mode === "auto" ? "Payment received. Your plan is active and will renew automatically." : "Payment received. Your plan is active.")}`); router.refresh(); return; }
          setMsg(j.error ?? "We couldn't confirm the payment yet. If money was deducted, your plan will switch on automatically within a few minutes."); setBusy(false);
        },
        modal: { ondismiss: () => { setBusy(false); setMsg((m) => (failed.current || m ? m : "Payment window closed. No payment was made.")); } },
      });
      rzp.on("payment.failed", (resp: any) => { failed.current = true; const info = explainPayError(resp?.error); setFail(info); setMsg(""); report(resp?.error); });
      rzp.open();
    } catch (e: any) { setFail(explainPayError(e?.message)); setBusy(false); }
  }
  const switchBtn = (label: string, method: "RAZORPAY" | "UPI" | "BANK", to?: "MONTHLY") => (
    <form key={label} action={switchPayment}><input type="hidden" name="id" value={paymentId} /><input type="hidden" name="method" value={method} />{to && <input type="hidden" name="interval" value={to} />}<button className={ghost}>{label}</button></form>);
  const actions = (f: PayFallback) => {
    if (f === "RETRY") return <button key="retry" onClick={start} disabled={busy} className={btn}>Try again</button>;
    if (f === "ONE_TIME" && mode === "auto" && enabled.razorpay) return switchBtn(`Pay ${interval === "YEARLY" ? "1 year" : "1 month"} now instead (no auto-renewal)`, "RAZORPAY");
    if (f === "MONTHLY" && interval === "YEARLY") return switchBtn("Pay monthly instead", "RAZORPAY", "MONTHLY");
    if (f === "BANK_TRANSFER" && enabled.bank) return switchBtn("Pay by bank transfer", "BANK");
    if (f === "OTHER_METHOD") return <Link key="other" href={`/subscription?i=${interval}`} className={ghost + " inline-flex items-center"}>Choose another way to pay</Link>;
    return null;
  };
  return <div className="space-y-3">
    <button onClick={start} disabled={busy} className={`${btn} w-full sm:w-auto`}>{busy ? "Please wait…" : mode === "auto" ? `Set up auto-renewal · ${amountLabel}` : `Pay ${amountLabel}`}</button>
    {msg && <p role="status" className="text-sm text-ink/80">{msg}</p>}
    {fail && <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm">
      <p className="font-semibold text-danger">{fail.title}</p><p className="mt-1">{fail.message}</p>
      {fail.tips.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/80">{fail.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
      <div className="mt-3 flex flex-wrap gap-2">{fail.fallbacks.filter((f, i, a) => a.indexOf(f) === i).map((f) => actions(f))}</div></div>}
  </div>;
}
