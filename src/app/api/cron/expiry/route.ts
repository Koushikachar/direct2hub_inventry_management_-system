import { bearerOk } from "@/lib/cronauth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
/** Daily job (vercel.json): one notification per business listing batches that expire within 30 days or already have. Each batch is announced once. */
export async function GET(req: Request) {
  if (!bearerOk(req)) return new Response("unauthorized", { status: 401 });
  const soon = new Date(Date.now() + 30 * 864e5), batches = await db.batch.findMany({ where: { qty: { gt: 0 }, alertedAt: null, expiresOn: { not: null, lte: soon } }, include: { product: { select: { name: true } } }, orderBy: { expiresOn: "asc" }, take: 1000 });
  const byOrg = new Map<string, typeof batches>(); for (const b of batches) byOrg.set(b.orgId, [...(byOrg.get(b.orgId) ?? []), b]);
  for (const [orgId, list] of byOrg) {
    const now = Date.now(), gone = list.filter((b) => b.expiresOn!.getTime() < now - 864e5).length, names = list.slice(0, 3).map((b) => `${b.product.name} (${b.code})`).join(", ");
    await db.$transaction([db.notification.create({ data: { orgId, kind: "expiry", title: `${list.length} batch${list.length === 1 ? "" : "es"} expiring soon${gone ? `, ${gone} already expired` : ""}`, body: `${names}${list.length > 3 ? " and more" : ""}. Sell or write off before they expire.`, href: "/traceability" } }), db.batch.updateMany({ where: { id: { in: list.map((b) => b.id) } }, data: { alertedAt: new Date() } })]);
  }
  return Response.json({ organizations: byOrg.size, batches: batches.length });
}
