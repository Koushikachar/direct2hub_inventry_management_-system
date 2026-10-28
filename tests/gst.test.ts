import { describe, it, expect } from "vitest";
import { buildInvoice } from "../src/lib/gst";
describe("GST invoice maths", () => {
  it("splits CGST/SGST within a state and exact paise", () => {
    const r = buildInvoice([{ name: "Tee", hsn: "6109", qty: 2, rate: 499, taxRate: 18 }], true);
    expect(r.subtotal).toBe(998); expect(r.tax).toBe(179.64); expect(r.total).toBe(1177.64); expect(r.cgst + r.sgst).toBe(179.64); expect(r.igst).toBe(0);
  });
  it("uses IGST across states and rounds per line", () => {
    const r = buildInvoice([{ name: "A", hsn: null, qty: 3, rate: 99.99, taxRate: 5 }, { name: "B", hsn: null, qty: 1, rate: 100, taxRate: 0 }], false);
    expect(r.igst).toBe(r.tax); expect(r.cgst).toBe(0); expect(r.total).toBe(r.subtotal + r.tax);
  });
});
