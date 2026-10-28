// Usage: npx tsx scripts/make-operator.ts you@example.com  (run after you've registered and onboarded)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const email = process.argv[2]; const u = email && await db.user.findUnique({ where: { email } });
  if (!u) throw new Error("User not found. Register and create your organization first.");
  const org = await db.organization.upsert({ where: { id: "platform" }, update: {}, create: { id: "platform", name: "Platform" } });
  await db.membership.upsert({ where: { userId_orgId: { userId: u.id, orgId: org.id } }, update: { role: "PLATFORM_OPERATOR" }, create: { userId: u.id, orgId: org.id, role: "PLATFORM_OPERATOR" } });
  await db.auditLog.create({ data: { orgId: org.id, actorId: u.id, action: "operator.granted", detail: { via: "cli" } } });
  console.log("Granted PLATFORM_OPERATOR to", email);
})().finally(() => db.$disconnect());
