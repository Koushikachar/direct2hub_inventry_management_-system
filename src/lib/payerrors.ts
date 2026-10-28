/** Turns the raw error a payment provider gives (Razorpay Checkout, Razorpay API, Stripe, or a plain string) into a message a customer can act on.
 *  Pure and browser-safe: it is used by the server (when a payment can't be started) and by the checkout button (when the payment window reports a failure). */
export type PayErrorKind =
  | "recurring_not_supported" | "amount_limit" | "insufficient_funds" | "declined" | "expired_card" | "bad_card_details" | "authentication_failed"
  | "international_not_enabled" | "upi_failed" | "cancelled" | "timeout" | "provider_down" | "unknown";
/** Which way out we suggest. The checkout screen turns these into buttons. */
export type PayFallback = "ONE_TIME" | "OTHER_METHOD" | "BANK_TRANSFER" | "RETRY" | "MONTHLY" | "CONTACT_BANK";
export type PayErrorInfo = { kind: PayErrorKind; title: string; message: string; tips: string[]; fallbacks: PayFallback[]; retryable: boolean };

/** Anything a provider might hand us. */
export type RawPayError = string | { code?: string; description?: string; reason?: string; message?: string; source?: string; step?: string; decline_code?: string; type?: string; metadata?: unknown; error?: RawPayError } | null | undefined;

const flat = (e: RawPayError): string => {
  if (!e) return "";
  if (typeof e === "string") return e;
  const x = e.error && typeof e.error === "object" ? e.error : e;
  return [x.code, x.decline_code, x.reason, x.description, x.message, x.step, x.source].filter((v) => typeof v === "string" && v).join(" | ");
};

const INFO: Record<PayErrorKind, Omit<PayErrorInfo, "kind">> = {
  recurring_not_supported: {
    title: "This card can't be used for automatic renewal",
    message: "Your bank or card type doesn't allow recurring (auto-debit) payments, so we couldn't set up auto-renewal on it. Nothing was charged.",
    tips: ["Pay for one period instead. It works with any card, UPI or netbanking, and we remind you before it ends.", "Or use a different card. Many credit cards from major banks support auto-renewal; most debit cards, prepaid and international cards don't.", "Or pay by UPI or bank transfer."],
    fallbacks: ["ONE_TIME", "OTHER_METHOD", "BANK_TRANSFER"], retryable: false },
  amount_limit: {
    title: "The amount is above the limit for this payment method",
    message: "Your bank, card or UPI app caps how much one payment can be, and this amount is over it. Nothing was charged.",
    tips: ["Try netbanking or a credit card, which usually allow higher amounts than UPI. Many banks cap UPI at ₹1,00,000 per payment, some lower.", "Ask your bank to raise the online or UPI limit, then try again.", "Pay monthly instead of yearly so each payment is smaller, or pay by bank transfer (NEFT / IMPS / RTGS), which has no card limit."],
    fallbacks: ["OTHER_METHOD", "MONTHLY", "BANK_TRANSFER"], retryable: false },
  insufficient_funds: {
    title: "Not enough balance",
    message: "The account or card doesn't have enough available balance for this payment. Nothing was charged.",
    tips: ["Add funds or use another card or account, then try again."], fallbacks: ["RETRY", "OTHER_METHOD"], retryable: true },
  declined: {
    title: "Your bank declined the payment",
    message: "The bank that issued the card or account didn't approve the payment. This is usually a security rule or a limit on their side. Nothing was charged.",
    tips: ["Try another card, UPI or netbanking.", "Check that online payments are switched on for the card in your banking app.", "If it keeps happening, call the number on the back of the card."],
    fallbacks: ["OTHER_METHOD", "CONTACT_BANK", "RETRY"], retryable: true },
  expired_card: {
    title: "This card has expired", message: "The card's expiry date has passed. Nothing was charged.", tips: ["Use a different card, UPI or netbanking."], fallbacks: ["OTHER_METHOD"], retryable: false },
  bad_card_details: {
    title: "The card details don't look right", message: "The card number, expiry date or CVV was not accepted. Nothing was charged.", tips: ["Check the number, expiry and CVV and try again, or use another payment method."], fallbacks: ["RETRY", "OTHER_METHOD"], retryable: true },
  authentication_failed: {
    title: "The bank couldn't confirm it was you",
    message: "The OTP or app approval didn't go through (wrong code, timed out, or not received). Nothing was charged.",
    tips: ["Make sure your phone number is registered with the bank so the OTP arrives, then try again.", "Or pay with UPI or netbanking."], fallbacks: ["RETRY", "OTHER_METHOD"], retryable: true },
  international_not_enabled: {
    title: "This card isn't enabled for this kind of payment", message: "International or online use isn't switched on for the card. Nothing was charged.",
    tips: ["Enable online / international transactions in your banking app, or use an Indian card, UPI or netbanking."], fallbacks: ["OTHER_METHOD", "CONTACT_BANK"], retryable: false },
  upi_failed: {
    title: "The UPI payment didn't go through", message: "The UPI request was rejected or expired before it was approved. Nothing was charged.",
    tips: ["Check the UPI ID, approve the request within a few minutes, and make sure your daily UPI limit isn't used up.", "Or pay with a card or netbanking."], fallbacks: ["RETRY", "OTHER_METHOD"], retryable: true },
  cancelled: {
    title: "Payment cancelled", message: "You closed the payment window, so no payment was made.", tips: ["Start again whenever you're ready."], fallbacks: ["RETRY"], retryable: true },
  timeout: {
    title: "The payment took too long", message: "We didn't hear back from the bank in time. If money was deducted it will be matched automatically within a few hours, and your plan will switch on.",
    tips: ["Check your payment history in a few minutes before trying again, so you aren't charged twice."], fallbacks: ["RETRY"], retryable: true },
  provider_down: {
    title: "We couldn't reach the payment provider", message: "The payment service didn't respond. Nothing was charged.", tips: ["Try again in a minute, or pick another payment method."], fallbacks: ["RETRY", "OTHER_METHOD"], retryable: true },
  unknown: {
    title: "Payment could not be completed", message: "The payment didn't go through. Nothing was charged unless you see it in your bank statement, in which case it will be matched to your account automatically.",
    tips: ["Try again, or use a different card, UPI or netbanking.", "If it keeps failing, pay by bank transfer or contact us from the Contact page."], fallbacks: ["RETRY", "OTHER_METHOD", "BANK_TRANSFER"], retryable: true },
};

/** Order matters: the first rule that matches wins, so the specific ones come before the general ones. */
const RULES: [RegExp, PayErrorKind][] = [
  [/not eligible for recurring|recurring (payments?|transactions?|mandate)? ?(is |are )?not (supported|allowed|enabled|eligible)|e-?mandate|auto-?pay.*(not|fail)|card.*not supported.*(recurring|emi|subscription)|recurring.*(not|un)supported|si_?not_supported|BAD_REQUEST_.*RECURRING/i, "recurring_not_supported"],
  [/amount exceeds (the )?max|exceeds? (the )?(maximum|max|limit|allowed)|maximum amount (allowed|limit)|above (the )?(maximum|limit)|per[- ]transaction limit|transaction limit|limit exceeded|amount_too_large|amount.*too (large|high)|daily (transaction )?limit|upi.*limit|BAD_REQUEST_AMOUNT/i, "amount_limit"],
  [/insufficient[_ ]funds?|low balance|not enough balance|balance (is )?(too )?low/i, "insufficient_funds"],
  [/expired[_ ]card|card (has )?expired|expiry date.*(passed|invalid)/i, "expired_card"],
  [/incorrect[_ ]?(cvc|cvv|number|zip)|invalid[_ ]?(cvc|cvv|card|expiry)|card number.*(invalid|incorrect)|processing_error.*card|incorrect card/i, "bad_card_details"],
  [/international.*(not|disabled)|not enabled for international|online transactions? (are )?(not|disabled)|card.*not enabled|transaction not permitted|not permitted to cardholder/i, "international_not_enabled"],
  [/authentication[_ ]?(failed|required|error)|3-?d ?secure|otp.*(wrong|invalid|incorrect|expired|fail)|incorrect otp|authenticat/i, "authentication_failed"],
  [/vpa|upi.*(declined|expired|fail|reject|collect)|collect request|payer.*(declin|reject)/i, "upi_failed"],
  [/card[_ ]declined|declined|do not honou?r|payment (was )?declined|issuer.*(declin|reject)|BAD_REQUEST_PAYMENT_DECLINED|generic_decline|bank (has )?(declined|rejected)|rejected by (the )?(bank|issuer)/i, "declined"],
  [/cancel+ed|payment_cancelled|dismiss|closed the (payment )?(window|popup)|user (closed|cancelled)/i, "cancelled"],
  [/time(d)? ?out|timed out|took too long|expired.*(order|link)|session expired/i, "timeout"],
  [/couldn'?t reach|could not reach|didn'?t respond|did not respond|network|ENOTFOUND|ECONN|fetch failed|returned 5\d\d|503|502|gateway|service unavailable|temporarily unavailable/i, "provider_down"],
];

export function payErrorKind(e: RawPayError): PayErrorKind { const t = flat(e); if (!t) return "unknown"; for (const [re, k] of RULES) if (re.test(t)) return k; return "unknown"; }
export function explainPayError(e: RawPayError): PayErrorInfo { const kind = payErrorKind(e); return { kind, ...INFO[kind] }; }
/** One line for places that only show a short message (a redirect with ?e=...). */
export const payErrorText = (e: RawPayError) => { const i = explainPayError(e); return `${i.title}. ${i.message}`; };
