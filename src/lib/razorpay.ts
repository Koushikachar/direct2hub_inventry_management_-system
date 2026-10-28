import { db } from "./db"; import { price, type Interval } from "./billing";
/** Server-side Razorpay client for the in-page checkout (orders) and AutoPay (plans + subscriptions). Plain fetch, no SDK. Secrets never leave the server. */
export const razorpayConfigured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const auth = () => `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
/** Carries Razorpay's own error object so callers can explain it with explainPayError(e.raw). */
export class RzError extends Error { constructor(message: string, public raw: unknown, public status = 502) { super(message); } }
export async function rz(path: string, body?: unknown, method: "GET" | "POST" = body ? "POST" : "GET") {
  let r: Response;
  try { r = await fetch(`https://api.razorpay.com/v1${path}`, { method, cache: "no-store", headers: { Authorization: auth(), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12_000) }); }
  catch { throw new RzError("Couldn't reach Razorpay", "Couldn't reach Razorpay"); }
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("razorpay error", r.status, j?.error?.code); throw new RzError(j?.error?.description ?? `Razorpay returned ${r.status}`, j?.error ?? `Razorpay returned ${r.status}`, r.status); }
  return j;
}
/** A recurring Razorpay "plan" is fixed (amount + period), so we create one per plan/interval/amount and remember it. */
export async function razorpayPlanFor(plan: string, interval: Interval, paise: number, label: string) {
  const key = `${plan}:${interval}:${paise}`, have = await db.billingPlan.findUnique({ where: { key } }); if (have) return have.razorpayPlanId;
  const made = await rz("/plans", { period: interval === "YEARLY" ? "yearly" : "monthly", interval: 1, item: { name: `Direct2Hub ${label} (${interval === "YEARLY" ? "yearly" : "monthly"})`.slice(0, 80), amount: paise, currency: "INR" }, notes: { plan, interval } });
  try { await db.billingPlan.create({ data: { key, razorpayPlanId: made.id } }); } catch (e: any) { if (e?.code !== "P2002") throw e; }
  return String(made.id);
}
/** Razorpay stops after `total_count` charges; this is the longest it may run (10 years). */
export const totalCount = (interval: Interval) => (interval === "YEARLY" ? 10 : 120);
export { price };
