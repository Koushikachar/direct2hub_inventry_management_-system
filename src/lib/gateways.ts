/** Thin server-side clients for Razorpay and Stripe over plain fetch (no SDKs, so no new dependencies). Secrets never leave the server. */
type R<T> = { ok: true; data: T } | { ok: false; error: string };
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

export async function createRazorpayLink(a: { paymentId: string; paise: number; description: string; name: string; email: string }): Promise<R<{ id: string; url: string }>> {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET; if (!id || !secret) return { ok: false, error: "Razorpay isn't configured" };
  try {
    const r = await fetch("https://api.razorpay.com/v1/payment_links", { method: "POST", cache: "no-store",
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: a.paise, currency: "INR", accept_partial: false, reference_id: a.paymentId, description: a.description.slice(0, 250), customer: { name: a.name.slice(0, 100), email: a.email },
        notify: { email: false, sms: false }, reminder_enable: false, expire_by: Math.floor(Date.now() / 1000) + 24 * 3600, callback_url: `${site()}/api/billing/razorpay/return`, callback_method: "get", notes: { paymentId: a.paymentId } }) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.id || !j.short_url) { console.error("razorpay link error", r.status, j?.error?.code); return { ok: false, error: j?.error?.description ?? `Razorpay returned ${r.status}` }; }
    return { ok: true, data: { id: j.id, url: j.short_url } };
  } catch { return { ok: false, error: "Couldn't reach Razorpay" }; }
}

async function stripe(path: string, method: "GET" | "POST", body?: URLSearchParams): Promise<R<any>> {
  const key = process.env.STRIPE_SECRET_KEY; if (!key) return { ok: false, error: "Stripe isn't configured" };
  try {
    const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, cache: "no-store", headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("stripe error", r.status, j?.error?.code); return { ok: false, error: j?.error?.message ?? `Stripe returned ${r.status}` }; }
    return { ok: true, data: j };
  } catch { return { ok: false, error: "Couldn't reach Stripe" }; }
}
/** Subscription-mode Checkout with an inline recurring price (no products to pre-create in the Stripe dashboard). The amount already includes GST. */
export async function createStripeCheckout(a: { paymentId: string; orgId: string; paise: number; plan: string; planLabel: string; interval: "MONTHLY" | "YEARLY"; email: string }): Promise<R<{ id: string; url: string }>> {
  const b = new URLSearchParams({ mode: "subscription", client_reference_id: a.paymentId, customer_email: a.email,
    success_url: `${site()}/api/billing/stripe/return?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${site()}/subscription?e=${encodeURIComponent("Payment was cancelled")}`,
    "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "inr", "line_items[0][price_data][unit_amount]": String(a.paise),
    "line_items[0][price_data][recurring][interval]": a.interval === "YEARLY" ? "year" : "month", "line_items[0][price_data][product_data][name]": `Direct2Hub ${a.planLabel} (${a.interval === "YEARLY" ? "yearly" : "monthly"})`,
    "metadata[paymentId]": a.paymentId, "metadata[orgId]": a.orgId, "subscription_data[metadata][orgId]": a.orgId, "subscription_data[metadata][plan]": a.plan });
  const r = await stripe("checkout/sessions", "POST", b); if (!r.ok) return r;
  return r.data?.id && r.data?.url ? { ok: true, data: { id: r.data.id, url: r.data.url } } : { ok: false, error: "Stripe didn't return a checkout link" };
}
export const getStripeSession = (id: string) => stripe(`checkout/sessions/${encodeURIComponent(id)}`, "GET");
export const stripeCancelAtPeriodEnd = (subId: string, cancel: boolean) => stripe(`subscriptions/${encodeURIComponent(subId)}`, "POST", new URLSearchParams({ cancel_at_period_end: String(cancel) }));
