// Development-only demo data. Set SEED_EMAIL to a registered user to attach the demo org to them.
import { PrismaClient } from "@prisma/client";
if (process.env.NODE_ENV === "production") { console.error("Refusing to seed production"); process.exit(1); }
const db = new PrismaClient();
(async () => {
  const org = await db.organization.upsert({ where: { id: "demo-org" }, update: {}, create: { id: "demo-org", name: "Demo Traders (dev seed)" } });
  const w = (await db.warehouse.findFirst({ where: { orgId: org.id } })) ?? await db.warehouse.create({ data: { orgId: org.id, name: "Main warehouse" } });
  for (const [sku, name, price, cost, qty] of [["DEMO-TEE-M", "Cotton Tee M", 499, 220, 100], ["DEMO-MUG", "Steel Mug", 349, 140, 40], ["DEMO-BAG", "Tote Bag", 299, 90, 12]] as const) {
    const p = await db.product.upsert({ where: { orgId_sku: { orgId: org.id, sku } }, update: {}, create: { orgId: org.id, sku, name, price, unitCost: cost, reorderAt: 15 } });
    await db.stockBalance.upsert({ where: { productId_warehouseId: { productId: p.id, warehouseId: w.id } }, update: {}, create: { orgId: org.id, productId: p.id, warehouseId: w.id, sellable: qty } });
  }
  const u = process.env.SEED_EMAIL && await db.user.findUnique({ where: { email: process.env.SEED_EMAIL } });
  if (u) await db.membership.upsert({ where: { userId_orgId: { userId: u.id, orgId: org.id } }, update: {}, create: { userId: u.id, orgId: org.id, role: "OWNER" } });
  console.log("Seeded demo-org");
})().finally(() => db.$disconnect());
