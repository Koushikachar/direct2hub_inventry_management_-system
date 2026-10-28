import { db } from "./db"; import { PLANS } from "./plans"; import { lapsed } from "./billing";
export { PLANS };
/** The plan limits actually enforced: a paid plan whose subscription ran out (past the grace period) falls back to Free. Plans set by hand by the admin have no subscription row and never expire. */
export async function usage(orgId: string) {
  const [o, products, members, invites, sub, locations] = await Promise.all([db.organization.findUnique({ where: { id: orgId } }), db.product.count({ where: { orgId, archived: false } }),
    db.membership.count({ where: { orgId } }), db.invitation.count({ where: { orgId, usedAt: null, expiresAt: { gt: new Date() } } }), db.subscription.findUnique({ where: { orgId } }).catch(() => null), db.warehouse.count({ where: { orgId } })]);
  let key = o?.plan ?? "FREE"; if (sub && key !== "FREE" && lapsed(sub.currentPeriodEnd)) key = "FREE";
  return { plan: key, ...(PLANS[key] ?? PLANS.FREE), productCount: products, memberCount: members + invites, locationCount: locations, subscription: sub };
}
export async function checkLimit(orgId: string, kind: "products" | "members" | "locations", adding: number) {
  const u = await usage(orgId);
  if (kind === "products" && u.productCount + adding > u.products) return `Your ${u.label} plan allows ${u.products} products. Upgrade on the My plan page.`;
  if (kind === "members" && u.memberCount + adding > u.members) return `Your ${u.label} plan allows ${u.members} team members (pending invitations count).`;
  if (kind === "locations" && u.locationCount + adding > u.locations) return `Your ${u.label} plan allows ${u.locations} warehouse${u.locations === 1 ? "" : "s"}. Upgrade on the My plan page to add more.`;
  return null;
}
