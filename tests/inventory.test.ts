// Integration tests: need a throwaway Postgres with the schema applied. Run:
//   TEST_DATABASE_URL=postgresql://... npx prisma migrate deploy && TEST_DATABASE_URL=... npm test
// They are skipped (not silently passed) when TEST_DATABASE_URL is unset.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as id } from "crypto";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("inventory integrity", () => {
  let db: any, reserveStock: any, receiveLine: any;
  beforeAll(async () => { process.env.DATABASE_URL = url; process.env.DIRECT_URL = url;
    ({ db } = await import("../src/lib/db")); ({ reserveStock, receiveLine } = await import("../src/lib/inventory")); });
  async function setup(sellable: number) {
    const org = await db.organization.create({ data: { name: "t-" + id() } }), w = await db.warehouse.create({ data: { orgId: org.id, name: "W" } });
    const p = await db.product.create({ data: { orgId: org.id, sku: id(), name: "P", price: 10, unitCost: 5 } });
    await db.stockBalance.create({ data: { orgId: org.id, productId: p.id, warehouseId: w.id, sellable } });
    return { orgId: org.id, warehouseId: w.id, productId: p.id, bal: () => db.stockBalance.findFirst({ where: { productId: p.id } }) };
  }
  it("two concurrent orders cannot both reserve the last unit", async () => {
    const s = await setup(1), go = () => reserveStock({ ...s, qty: 1, actorId: "u", orderId: "o", key: id() });
    const r = await Promise.all([go(), go()]);
    expect(r.filter((x: any) => x.ok).length).toBe(1); expect((await s.bal()).reserved).toBe(1);
  });
  it("a retried reservation does not reserve twice", async () => {
    const s = await setup(5), a = { ...s, qty: 2, actorId: "u", orderId: "o", key: id() };
    await Promise.all([reserveStock(a), reserveStock(a), reserveStock(a)]);
    expect((await s.bal()).reserved).toBe(2);
  });
  it("partial receipts add only received units, retries don't double-count, over-receipt is refused", async () => {
    const s = await setup(0), po = await db.purchaseOrder.create({ data: { orgId: s.orgId, status: "ORDERED", total: 50,
      supplier: { create: { orgId: s.orgId, name: "S" } }, lines: { create: { productId: s.productId, qty: 10, unitCost: 5 } } }, include: { lines: true } });
    const line = po.lines[0].id, key = id(), base = { orgId: s.orgId, warehouseId: s.warehouseId, lineId: line, actorId: "u" };
    await receiveLine({ ...base, qty: 4, key }); await receiveLine({ ...base, qty: 4, key });
    expect((await s.bal()).sellable).toBe(4);
    expect((await db.purchaseOrder.findUnique({ where: { id: po.id } })).status).toBe("PARTIAL");
    expect((await receiveLine({ ...base, qty: 7, key: id() })).ok).toBe(false);
    await receiveLine({ ...base, qty: 6, key: id() });
    expect((await s.bal()).sellable).toBe(10); expect((await db.purchaseOrder.findUnique({ where: { id: po.id } })).status).toBe("RECEIVED");
  });
});
