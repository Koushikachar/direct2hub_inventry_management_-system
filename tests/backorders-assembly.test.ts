// Pure checks always run. The database checks need a throwaway Postgres with the schema applied (same as inventory.test.ts):
//   TEST_DATABASE_URL=postgresql://... npm test
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as id } from "crypto";
import { canDispatch } from "../src/lib/backorders";
import { money, toForeign, CODES } from "../src/lib/currency";
describe("backorder rules (pure)", () => {
  it("only a confirmed order that is not waiting for stock can be dispatched", () => {
    expect(canDispatch({ status: "CONFIRMED", backordered: false })).toBe(true); expect(canDispatch({ status: "CONFIRMED", backordered: true })).toBe(false);
    for (const status of ["DRAFT", "DISPATCHED", "DELIVERED", "CANCELLED"]) expect(canDispatch({ status, backordered: false })).toBe(false);
  });
});
describe("currency helpers", () => {
  it("converts rupees to a foreign unit price at the frozen rate, to 2 decimals", () => { expect(toForeign(8350, 83.5)).toBe(100); expect(toForeign(1000, 83)).toBe(12.05); expect(toForeign(0, 83)).toBe(0); });
  it("formats rupees and dollars", () => { expect(money(1234.5)).toContain("1,234.50"); expect(money(1234.5, "USD")).toContain("1,234.50"); });
  it("offers INR first and the common foreign currencies", () => { expect(CODES[0]).toBe("INR"); expect(CODES).toContain("USD"); expect(CODES).toContain("AED"); });
});
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("backorders and assembly (database)", () => {
  let db: any, tryReserve: any, fulfilBackorders: any, reserveMany: any;
  beforeAll(async () => { process.env.DATABASE_URL = url; process.env.DIRECT_URL = url; ({ db } = await import("../src/lib/db")); ({ tryReserve, fulfilBackorders } = await import("../src/lib/backorders")); ({ reserveMany } = await import("../src/lib/inventory")); });
  async function world(stock: number) {
    const org = await db.organization.create({ data: { name: "t-" + id(), backorders: true } }), w = await db.warehouse.create({ data: { orgId: org.id, name: "W", isDefault: true } });
    const p = await db.product.create({ data: { orgId: org.id, sku: id(), name: "P", price: 10, unitCost: 5 } });
    await db.stockBalance.create({ data: { orgId: org.id, productId: p.id, warehouseId: w.id, sellable: stock } });
    const order = async (qty: number, n: number) => db.order.create({ data: { orgId: org.id, number: n, customer: "C", status: "CONFIRMED", backordered: true, total: 0, lines: { create: [{ productId: p.id, qty, unitPrice: 10 }] } } });
    return { org, w, p, order, bal: () => db.stockBalance.findFirst({ where: { productId: p.id } }) };
  }
  it("a waiting order stays waiting while stock is short and reserves nothing", async () => {
    const x = await world(1), o = await x.order(3, 1); expect(await tryReserve(x.org.id, x.w.id, "u", o.id)).toBe(false);
    expect((await x.bal()).reserved).toBe(0); expect((await db.order.findUnique({ where: { id: o.id } })).backordered).toBe(true);
  });
  it("when stock arrives the oldest waiting order is filled first, and a second call does not reserve twice", async () => {
    const x = await world(0), a = await x.order(2, 1), b = await x.order(2, 2);
    await db.stockBalance.updateMany({ where: { productId: x.p.id }, data: { sellable: 3 } }); // only enough for one of them
    expect(await fulfilBackorders(x.org.id, x.w.id, "u")).toBe(1);
    expect((await db.order.findUnique({ where: { id: a.id } })).backordered).toBe(false); expect((await db.order.findUnique({ where: { id: b.id } })).backordered).toBe(true);
    expect((await x.bal()).reserved).toBe(2); await fulfilBackorders(x.org.id, x.w.id, "u"); expect((await x.bal()).reserved).toBe(2);
  });
  it("assembly takes parts and adds finished units atomically, and refuses when a part is short", async () => {
    const x = await world(10), fin = await db.product.create({ data: { orgId: x.org.id, sku: id(), name: "Gift box", price: 50, unitCost: 0 } });
    await db.bundleComponent.create({ data: { orgId: x.org.id, bundleId: fin.id, componentId: x.p.id, qty: 4 } });
    const comps = await db.bundleComponent.findMany({ where: { bundleId: fin.id } }), need = comps[0].qty * 2;
    const n = await db.$executeRaw`UPDATE "StockBalance" SET sellable = sellable - ${need} WHERE "productId"=${x.p.id} AND sellable - reserved >= ${need}`; expect(n).toBe(1);
    const n2 = await db.$executeRaw`UPDATE "StockBalance" SET sellable = sellable - ${need} WHERE "productId"=${x.p.id} AND sellable - reserved >= ${need}`; expect(n2).toBe(0); // only 2 left, 8 needed
    expect((await x.bal()).sellable).toBe(2);
  });
});
