import { PLANS } from "./plans";
/** The only facts the website assistant may use. It is built from the real plan table, so prices here can never drift from the pricing page. */
export function siteFacts() {
  const rs = (n: number) => `₹${n.toLocaleString("en-IN")}`, plan = (k: string) => { const p = PLANS[k]; return `${p.label}: ${p.monthly ? `${rs(p.monthly)}/month or ${rs(p.yearly)}/year (before GST)` : "free"}, up to ${p.products.toLocaleString("en-IN")} products, ${p.members} team members, ${p.locations} warehouse${p.locations > 1 ? "s" : ""}`; };
  return `Direct2Hub is inventory management software for Indian sellers (web app, works on phones).
Features: stock ledger that is only added to, never edited; orders (confirm, dispatch, cancel) with reservations; GST invoices, credit notes and e-way bill JSON for the GST portal's bulk upload; customers and price lists; purchases, goods receipts, supplier bills; returns with inspection; multiple warehouses and stock transfers; kits (bundles) and variants (size, colour); batch and expiry tracking and serial numbers; reports (stock value, receivables and payables aging, GST summary, reorder suggestions); low-stock alerts; invoice payment links through the business's own Razorpay account; webhooks and a REST API; barcode field; CSV import and export; product pictures and an AI assistant that answers questions about the business's own data and writes product descriptions.
Plans: ${plan("FREE")}. ${plan("GROWTH")}. ${plan("SCALE")}. Paying for a plan is by Razorpay (UPI, cards, netbanking), Stripe card, direct UPI or bank transfer. See /pricing.
Start: create an account at /register, verify the email, name your business, add products. The Free plan needs no card.
Help or anything not covered here: the contact form at /contact. Legal: /privacy and /terms.`;
}
