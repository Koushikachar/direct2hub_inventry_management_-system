import { describe, it, expect } from "vitest";
import { explainPayError, payErrorKind, payErrorText } from "../src/lib/payerrors";
describe("payment errors", () => {
  it("explains a card that can't be used for recurring payments (Razorpay wording)", () => {
    const e = explainPayError("This card is not eligible for recurring payments. Please use a different card.");
    expect(e.kind).toBe("recurring_not_supported"); expect(e.fallbacks).toContain("ONE_TIME"); expect(e.title).toContain("automatic renewal"); expect(e.message).toContain("Nothing was charged");
  });
  it("explains the amount limit", () => {
    const e = explainPayError({ code: "BAD_REQUEST_ERROR", description: "Amount exceeds maximum amount allowed.", source: "customer", step: "payment_authorization", reason: "input_validation_failed" });
    expect(e.kind).toBe("amount_limit"); expect(e.fallbacks).toContain("MONTHLY"); expect(e.fallbacks).toContain("BANK_TRANSFER"); expect(e.tips.join(" ")).toContain("UPI");
  });
  it("falls back to a plain message for the generic failure", () => {
    expect(payErrorKind("Payment could not be completed")).toBe("unknown");
    const e = explainPayError({ description: "Payment failed" }); expect(e.title).toBe("Payment could not be completed"); expect(e.retryable).toBe(true);
    expect(explainPayError(null).kind).toBe("unknown"); expect(explainPayError(undefined).kind).toBe("unknown"); expect(explainPayError("").kind).toBe("unknown");
  });
  it("recognises common card and bank failures", () => {
    expect(payErrorKind({ error: { code: "card_declined", decline_code: "insufficient_funds" } })).toBe("insufficient_funds");
    expect(payErrorKind({ code: "card_declined" })).toBe("declined"); expect(payErrorKind("Your card has expired.")).toBe("expired_card"); expect(payErrorKind({ code: "incorrect_cvc" })).toBe("bad_card_details");
    expect(payErrorKind("Payment failed because of 3D Secure authentication failure")).toBe("authentication_failed"); expect(payErrorKind("UPI collect request expired")).toBe("upi_failed");
    expect(payErrorKind("Payment was cancelled by user")).toBe("cancelled"); expect(payErrorKind("Couldn't reach Razorpay")).toBe("provider_down"); expect(payErrorKind("Razorpay returned 503")).toBe("provider_down");
  });
  it("reads the nested Stripe / Razorpay error shapes and never throws on odd input", () => {
    expect(payErrorKind({ error: { description: "Amount exceeds maximum amount allowed." } })).toBe("amount_limit");
    expect(() => explainPayError({ metadata: { a: 1 } } as any)).not.toThrow(); expect(payErrorKind(42 as any)).toBe("unknown");
  });
  it("gives a one-line text for redirects", () => { const t = payErrorText("Amount exceeds maximum amount allowed."); expect(t).toContain("above the limit"); expect(t.length).toBeLessThan(300); });
  it("never promises a refund or says money was lost", () => { for (const s of ["declined", "recurring", "amount exceeds maximum", "timeout", "weird"]) { const e = explainPayError(s); expect(/refund/i.test(e.message + e.tips.join(" "))).toBe(false); } });
});
