import { db } from "./db";
/** Double-click and flaky-network protection for "create" forms. Each form carries a random key made when the page was drawn. The first submit with a key wins;
 *  a repeat of the same key (a second click, a retry, the browser re-sending) is recognised so nothing is created twice. Keys are tidied away after two days. */
export async function firstUse(orgId: string, key: unknown, scope: string): Promise<boolean> {
  const k = typeof key === "string" ? key.trim() : ""; if (k.length < 8 || k.length > 80) return true; // no key sent (older page, API): behave as before
  try { await db.idempotencyKey.create({ data: { orgId, key: `${scope}:${k}` } }); return true; } catch (e: any) { if (e?.code === "P2002") return false; throw e; }
}
export const purgeKeys = () => db.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 2 * 86400_000) } } });
