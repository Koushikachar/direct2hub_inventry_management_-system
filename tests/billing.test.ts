import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { price, addPeriod, lapsed, methodsEnabled, upiLink, verifyRazorpayLink, verifyRazorpayOrder, verifyRazorpaySubscription, verifyRazorpayWebhook, verifyStripeSignature, taxPercent, receiptNo, METHOD_LABEL, METHOD_HINT, METHOD_SHORT } from "../src/lib/billing";
const h = (k: string, d: string) => createHmac("sha256", k).update(d).digest("hex");
describe("plan prices", () => {
  it("adds GST on top in whole paise", () => { expect(price("GROWTH", "MONTHLY", 18)).toEqual({ base: 99900, tax: 17982, total: 117882, taxPercent: 18 }); expect(price("SCALE", "YEARLY", 0).total).toBe(2999000); });
  it("rejects FREE and unknown plans", () => { expect(() => price("FREE", "MONTHLY")).toThrow(); expect(() => price("NOPE", "YEARLY")).toThrow(); });
  it("reads a sane GST percentage from env", () => { expect(taxPercent({ BILLING_GST_PERCENT: "18" })).toBe(18); expect(taxPercent({})).toBe(0); expect(taxPercent({ BILLING_GST_PERCENT: "abc" })).toBe(0); expect(taxPercent({ BILLING_GST_PERCENT: "500" })).toBe(0); });
});
describe("billing periods", () => {
  it("clamps month ends", () => { expect(addPeriod(new Date("2026-01-31T00:00:00Z"), "MONTHLY").toISOString()).toBe("2026-02-28T00:00:00.000Z"); expect(addPeriod(new Date("2028-01-31T00:00:00Z"), "MONTHLY").toISOString()).toBe("2028-02-29T00:00:00.000Z"); });
  it("adds a year and rolls the year over", () => { expect(addPeriod(new Date("2026-10-23T10:00:00Z"), "YEARLY").toISOString()).toBe("2027-10-23T10:00:00.000Z"); expect(addPeriod(new Date("2026-12-15T00:00:00Z"), "MONTHLY").toISOString()).toBe("2027-01-15T00:00:00.000Z"); });
  it("allows a 3 day grace period", () => { const end = new Date("2026-10-01T00:00:00Z"); expect(lapsed(end, end.getTime() + 2 * 864e5)).toBe(false); expect(lapsed(end, end.getTime() + 4 * 864e5)).toBe(true); });
  it("formats receipt numbers", () => { expect(receiptNo(7)).toBe("SUB-00007"); expect(receiptNo(null)).toBe("Pending"); });
});
describe("payment methods", () => {
  it("only enables configured methods", () => { expect(methodsEnabled({})).toEqual({ RAZORPAY: false, RAZORPAY_AUTO: false, STRIPE: false, UPI: false, BANK: false });
    expect(methodsEnabled({ RAZORPAY_KEY_ID: "a", RAZORPAY_KEY_SECRET: "b", PAY_UPI_ID: "x@upi" })).toEqual({ RAZORPAY: true, RAZORPAY_AUTO: true, STRIPE: false, UPI: true, BANK: false }); });
  it("has a label, hint and short name for every method", () => { for (const m of Object.keys(methodsEnabled({}))) { expect(METHOD_LABEL[m as keyof typeof METHOD_LABEL]).toBeTruthy(); expect(METHOD_HINT[m as keyof typeof METHOD_HINT]).toBeTruthy(); expect(METHOD_SHORT[m]).toBeTruthy(); } });
  it("builds a UPI deep link", () => { const l = upiLink({ vpa: "shop@okbank", name: "Direct2Hub", paise: 117882, note: "SUB abc" }); expect(l.startsWith("upi://pay?")).toBe(true); expect(l).toContain("pa=shop%40okbank"); expect(l).toContain("am=1178.82"); expect(l).toContain("cu=INR"); });
});
describe("gateway signatures", () => {
  it("verifies Razorpay payment-link callbacks", () => { const sig = h("sec", "plink_1|ref_1|paid|pay_1"); const q = { linkId: "plink_1", refId: "ref_1", status: "paid", paymentId: "pay_1", signature: sig };
    expect(verifyRazorpayLink(q, "sec")).toBe(true); expect(verifyRazorpayLink({ ...q, status: "created" }, "sec")).toBe(false); expect(verifyRazorpayLink({ ...q, signature: "" }, "sec")).toBe(false); expect(verifyRazorpayLink(q, "other")).toBe(false); });
  it("verifies Razorpay Checkout signatures (one-time order and AutoPay subscription use different id orders)", () => {
    const sig = h("sec", "order_1|pay_1"); expect(verifyRazorpayOrder("order_1", "pay_1", sig, "sec")).toBe(true); expect(verifyRazorpayOrder("order_2", "pay_1", sig, "sec")).toBe(false); expect(verifyRazorpayOrder("order_1", "pay_1", "", "sec")).toBe(false); expect(verifyRazorpayOrder("order_1", "pay_1", sig, "")).toBe(false);
    const ssig = h("sec", "pay_1|sub_1"); expect(verifyRazorpaySubscription("pay_1", "sub_1", ssig, "sec")).toBe(true); expect(verifyRazorpaySubscription("pay_1", "sub_2", ssig, "sec")).toBe(false);
    expect(verifyRazorpayOrder("pay_1", "order_1", sig, "sec")).toBe(false); expect(verifyRazorpaySubscription("sub_1", "pay_1", ssig, "sec")).toBe(false); // swapped order must not pass
    expect(verifyRazorpayOrder("order_1", "pay_1", ssig, "sec")).toBe(false); // a subscription signature is not a valid order signature
  });
  it("verifies Razorpay webhooks", () => { const raw = '{"event":"payment_link.paid"}'; expect(verifyRazorpayWebhook(raw, h("w", raw), "w")).toBe(true); expect(verifyRazorpayWebhook(raw + " ", h("w", raw), "w")).toBe(false); expect(verifyRazorpayWebhook(raw, null, "w")).toBe(false); });
  it("verifies Stripe webhooks and rejects stale or forged ones", () => { const raw = '{"id":"evt_1"}', now = 1_800_000_000_000, t = Math.floor(now / 1000), ok = `t=${t},v1=${h("whsec", `${t}.${raw}`)}`;
    expect(verifyStripeSignature(raw, ok, "whsec", now)).toBe(true); expect(verifyStripeSignature(raw, ok, "whsec", now + 10 * 60_000)).toBe(false);
    expect(verifyStripeSignature(raw, `t=${t},v1=deadbeef`, "whsec", now)).toBe(false); expect(verifyStripeSignature(raw + "x", ok, "whsec", now)).toBe(false); expect(verifyStripeSignature(raw, null, "whsec", now)).toBe(false); });
});
