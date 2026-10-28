import { describe, it, expect } from "vitest";
import { bucketOf, monthRange } from "../src/lib/aging";
describe("aging", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  it("buckets by days overdue", () => { const d = (n: number) => new Date(now.getTime() - n * 864e5); expect(bucketOf(d(-5), now)).toBe(0); expect(bucketOf(d(0), now)).toBe(0); expect(bucketOf(d(1), now)).toBe(1); expect(bucketOf(d(30), now)).toBe(1); expect(bucketOf(d(31), now)).toBe(2); expect(bucketOf(d(61), now)).toBe(3); expect(bucketOf(d(91), now)).toBe(4); });
  it("month ranges are Indian-time and validated", () => { const r = monthRange("2026-10", now); expect(r.from.toISOString()).toBe("2026-09-30T18:30:00.000Z"); expect(r.to.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(monthRange("2026-12", now).to.toISOString()).toBe("2026-12-31T18:30:00.000Z"); expect(monthRange("junk", now).key).toBe("2026-10"); expect(monthRange("2026-13", now).key).toBe("2026-10"); });
});
import { reorderCalc } from "../src/lib/aging";
import { listPrice } from "../src/lib/gst";
describe("reorder suggestions", () => {
  it("suggests an order when stock is at or below lead-time demand", () => { const r = reorderCalc(20, 90, 90, 7, 3); expect(r.perDay).toBe(1); expect(r.level).toBe(10); expect(r.need).toBe(false); expect(r.qty).toBe(0);
    const s = reorderCalc(8, 90, 90, 7, 3); expect(s.need).toBe(true); expect(s.qty).toBe(32); expect(s.daysLeft).toBe(8); });
  it("does nothing for items that don't sell", () => { const r = reorderCalc(0, 0, 90, 7, 3); expect(r.need).toBe(false); expect(r.qty).toBe(0); expect(r.daysLeft).toBe(null); });
});
describe("price lists", () => { it("applies a percentage to the paisa", () => { expect(listPrice(499, -10)).toBe(449.1); expect(listPrice(499, 5)).toBe(523.95); expect(listPrice(100, 0)).toBe(100); expect(listPrice(0.99, -50)).toBe(0.5); }); });
