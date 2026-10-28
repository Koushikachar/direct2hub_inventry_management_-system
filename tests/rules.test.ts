import { describe, it, expect } from "vitest";
import { matches, render } from "../src/lib/rules";
describe("automation rules", () => {
  const d = { total: 15000, customer: "Asha Traders", sku: "TEE-M" };
  it("evaluates conditions", () => {
    expect(matches(d)).toBe(true); expect(matches(d, "total", "gt", "10000")).toBe(true); expect(matches(d, "total", "lt", "10000")).toBe(false);
    expect(matches(d, "customer", "contains", "asha")).toBe(true); expect(matches(d, "sku", "eq", "tee-m")).toBe(true); expect(matches(d, "missing", "eq", "x")).toBe(false);
  });
  it("fills templates", () => { expect(render("Big order from {{customer}}: {{total}} {{nope}}", d)).toBe("Big order from Asha Traders: 15000 "); });
});
