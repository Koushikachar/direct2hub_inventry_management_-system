import { bearerOk } from "@/lib/cronauth";
import { db } from "@/lib/db"; import { syncShopify } from "@/lib/shopify"; import { processDue } from "@/lib/webhooks"; import { purgeKeys } from "@/lib/idempotency"; import { GET as billing } from "../billing/route"; import { GET as expiry } from "../expiry/route";
export const dynamic = "force-dynamic";
/** One daily job for hosts that allow few cron entries (Vercel Hobby): renewal reminders and plan expiry, batch-expiry notices, Shopify order imports, and webhook retries.
 *  Send  Authorization: Bearer $CRON_SECRET  (Vercel Cron adds it when CRON_SECRET is set). The separate /api/cron/billing and /api/cron/expiry routes keep working too. */
async function run(req: Request) {
  if (!bearerOk(req)) return new Response("Unauthorized", { status: 401 });
  const out: Record<string, unknown> = {};
  for (const [k, fn] of [["billing", billing], ["expiry", expiry]] as const) { try { out[k] = await (await fn(req)).json(); } catch (e: any) { out[k] = { error: String(e?.message ?? e).slice(0, 120) }; } }
  let imported = 0; for (const c of await db.connection.findMany({ where: { provider: "SHOPIFY" }, take: 50, select: { orgId: true } })) imported += (await syncShopify(c.orgId).catch(() => ({ created: 0 }))).created;
  out.shopifyImported = imported; out.webhooksRetried = await processDue(50).catch(() => 0); out.keysPurged = (await purgeKeys().catch(() => ({ count: 0 }))).count;
  return Response.json(out);
}
export const GET = run, POST = run;
