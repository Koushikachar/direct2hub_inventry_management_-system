import { describe, it, expect } from "vitest";
import { stockState, stockLabel, orderHint, suggestOrderQty } from "../src/lib/stockstate";
describe("stock state", () => {
  it("is out at zero or below, low at or under the reorder level, ok above", () => { expect(stockState(0, 5)).toBe("out"); expect(stockState(-2, 0)).toBe("out"); expect(stockState(5, 5)).toBe("low"); expect(stockState(6, 5)).toBe("ok"); expect(stockState(1, 0)).toBe("ok"); });
  it("labels", () => { expect(stockLabel(0, 5)).toBe("out of stock"); expect(stockLabel(3, 5)).toBe("3 available, low"); expect(stockLabel(40, 5)).toBe("40 available"); });
});
describe("order line hint", () => {
  it("says nothing without a quantity", () => { expect(orderHint({ qty: 0, available: 10, elsewhere: 0, reorderAt: 2 })).toBe(null); expect(orderHint({ qty: NaN, available: 10, elsewhere: 0, reorderAt: 2 })).toBe(null); });
  it("warns when the order is bigger than what is available, and points to other warehouses", () => { const h = orderHint({ qty: 12, available: 10, elsewhere: 30, reorderAt: 2 })!; expect(h.tone).toBe("warn"); expect(h.text.includes("Only 10")).toBe(true); expect(h.text.includes("30 more in other warehouses")).toBe(true);
    expect(orderHint({ qty: 1, available: 0, elsewhere: 0, reorderAt: 2 })!.text.startsWith("None available")).toBe(true); });
  it("flags an order that leaves you at or under the reorder level", () => { const h = orderHint({ qty: 8, available: 10, elsewhere: 0, reorderAt: 2 })!; expect(h.tone).toBe("low"); expect(h.text.includes("2 will be left")).toBe(true); expect(orderHint({ qty: 5, available: 10, elsewhere: 0, reorderAt: 2 })!.tone).toBe("ok"); });
});
describe("purchase suggestion", () => { it("tops up to twice the reorder level, counting what is already on order", () => { expect(suggestOrderQty(3, 0, 10)).toBe(17); expect(suggestOrderQty(3, 10, 10)).toBe(7); expect(suggestOrderQty(30, 0, 10)).toBe(0); expect(suggestOrderQty(0, 0, 0)).toBe(0); }); });
