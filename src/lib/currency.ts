export const CURRENCIES: [string, string][] = [["USD", "US dollar"], ["EUR", "Euro"], ["GBP", "Pound sterling"], ["AED", "UAE dirham"], ["SGD", "Singapore dollar"], ["AUD", "Australian dollar"], ["CAD", "Canadian dollar"], ["SAR", "Saudi riyal"]];
export const CODES = ["INR", ...CURRENCIES.map((c) => c[0])];
export const money = (n: number, cur = "INR") => new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { style: "currency", currency: cur }).format(n);
/** Rupee price to a foreign unit price, rounded to 2 decimals. fx = rupees per 1 unit of the foreign currency. */
export const toForeign = (inr: number, fx: number) => Math.round((inr / fx) * 100) / 100;
import { db } from "./db";
/** The currency and rate to freeze on a new invoice. A customer in a foreign currency with no rate set yet is invoiced in rupees (nothing is guessed). */
export async function invoiceFx(orgId: string, currency: string) {
  if (!currency || currency === "INR") return { currency: "INR", rate: 1 };
  const r = await db.exchangeRate.findUnique({ where: { orgId_currency: { orgId, currency } } });
  return r && Number(r.rate) > 0 ? { currency, rate: Number(r.rate) } : { currency: "INR", rate: 1 };
}
