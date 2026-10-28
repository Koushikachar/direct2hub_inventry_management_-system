import { createHmac, timingSafeEqual } from "crypto";
import { PLANS } from "./plans";
/** Pure billing helpers (no database): prices, periods, payment-method availability and gateway signature checks. */
export type Interval = "MONTHLY" | "YEARLY";
export type Method = "RAZORPAY" | "RAZORPAY_AUTO" | "STRIPE" | "UPI" | "BANK";
export const PAID_PLANS = ["GROWTH", "SCALE"] as const;
export const GRACE_DAYS = 3;
export const METHOD_LABEL: Record<Method, string> = { RAZORPAY: "Razorpay (UPI, cards, netbanking, wallets)", RAZORPAY_AUTO: "Auto-renewal with Razorpay (card or UPI AutoPay)", STRIPE: "Card with auto-renewal (Stripe)", UPI: "Pay to our UPI ID", BANK: "Bank transfer (NEFT / IMPS / RTGS)" };
/** Short names for tables and receipts. */
export const METHOD_SHORT: Record<string, string> = { RAZORPAY: "Razorpay", RAZORPAY_AUTO: "Razorpay AutoPay", STRIPE: "Card (Stripe)", UPI: "UPI", BANK: "Bank transfer" };
export const METHOD_HINT: Record<Method, string> = {
  RAZORPAY: "Instant. Pays for one period; we remind you before it ends.", RAZORPAY_AUTO: "Charged automatically each period. Not every card allows it; if yours doesn't you can pay one period instead.", STRIPE: "Instant. Your card is charged automatically each period. Cancel any time.",
  UPI: "Pay from any UPI app, then send us the UTR. Activated after we verify it.", BANK: "Transfer from your bank, then send us the reference. Activated after we verify it." };

export const taxPercent = (env: Record<string, string | undefined> = process.env) => { const n = Number(env.BILLING_GST_PERCENT ?? 0); return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : 0; };
/** Whole-paise price: base from the plan table, GST added on top. */
export function price(plan: string, interval: Interval, pct = taxPercent()) {
  const p = PLANS[plan]; if (!p || plan === "FREE") throw new Error("Unknown paid plan");
  const base = Math.round((interval === "YEARLY" ? p.yearly : p.monthly) * 100), tax = Math.round((base * pct) / 100);
  return { base, tax, total: base + tax, taxPercent: pct };
}
/** Calendar-month arithmetic in UTC; 31 Jan + 1 month = 28/29 Feb, not 3 March. */
export function addPeriod(from: Date, interval: Interval) {
  const months = interval === "YEARLY" ? 12 : 1, y = from.getUTCFullYear(), m = from.getUTCMonth() + months, last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(from.getUTCDate(), last), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
}
export const lapsed = (periodEnd: Date, now = Date.now()) => periodEnd.getTime() + GRACE_DAYS * 864e5 < now;
export const receiptNo = (n: number | null) => (n ? `SUB-${String(n).padStart(5, "0")}` : "Pending");
export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function methodsEnabled(env: Record<string, string | undefined> = process.env): Record<Method, boolean> {
  const rz = !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  return { RAZORPAY: rz, RAZORPAY_AUTO: rz, STRIPE: !!env.STRIPE_SECRET_KEY, UPI: !!env.PAY_UPI_ID, BANK: !!(env.PAY_BANK_ACCOUNT_NO && env.PAY_BANK_IFSC) };
}
export function bankDetails(env: Record<string, string | undefined> = process.env) {
  return { name: env.PAY_BANK_ACCOUNT_NAME ?? "", bank: env.PAY_BANK_NAME ?? "", account: env.PAY_BANK_ACCOUNT_NO ?? "", ifsc: env.PAY_BANK_IFSC ?? "", upi: env.PAY_UPI_ID ?? "", upiName: env.PAY_UPI_NAME ?? env.PAY_BANK_ACCOUNT_NAME ?? "" };
}
/** upi://pay deep link: opens the customer's UPI app on a phone with payee, amount and note filled in. */
export function upiLink(a: { vpa: string; name: string; paise: number; note: string }) {
  const q = new URLSearchParams({ pa: a.vpa, pn: a.name, am: (a.paise / 100).toFixed(2), cu: "INR", tn: a.note });
  return `upi://pay?${q.toString()}`;
}

const hmac = (key: string, data: string) => createHmac("sha256", key).update(data).digest("hex");
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
/** Razorpay redirect back from a Payment Link: HMAC of link id | reference id | status | payment id. */
export function verifyRazorpayLink(q: { linkId: string; refId: string; status: string; paymentId: string; signature: string }, secret: string) {
  return !!q.signature && same(hmac(secret, `${q.linkId}|${q.refId}|${q.status}|${q.paymentId}`), q.signature);
}
/** Razorpay Checkout (one-time order): HMAC of `order_id|payment_id`, keyed with the API key secret. */
export const verifyRazorpayOrder = (orderId: string, paymentId: string, signature: string, secret: string) => !!orderId && !!paymentId && !!signature && !!secret && same(hmac(secret, `${orderId}|${paymentId}`), signature);
/** Razorpay Checkout (subscription): the order of the two ids is reversed, `payment_id|subscription_id`. */
export const verifyRazorpaySubscription = (paymentId: string, subId: string, signature: string, secret: string) => !!subId && !!paymentId && !!signature && !!secret && same(hmac(secret, `${paymentId}|${subId}`), signature);
export const verifyRazorpayWebhook = (raw: string, signature: string | null, secret: string) => !!signature && !!secret && same(hmac(secret, raw), signature);
/** Stripe-Signature: `t=<unix>,v1=<hex>[,v1=...]`; HMAC of `t.rawBody`. Rejects timestamps older than the tolerance (replay protection). */
export function verifyStripeSignature(raw: string, header: string | null, secret: string, now = Date.now(), toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("=")), t = parts.find((p) => p[0] === "t")?.[1], sigs = parts.filter((p) => p[0] === "v1").map((p) => p[1] ?? "");
  if (!t || !/^\d+$/.test(t) || Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const want = hmac(secret, `${t}.${raw}`); return sigs.some((s) => same(want, s));
}
