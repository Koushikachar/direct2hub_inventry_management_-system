import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db } from "./db"; import { allow } from "./ratelimit";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export function newKey() { const prefix = randomBytes(4).toString("hex"), secret = randomBytes(24).toString("hex"); return { key: `d2h_live_${prefix}_${secret}`, prefix, hash: sha(secret) }; }
export function parseKey(header: string | null) { const m = /^Bearer d2h_live_([0-9a-f]{8})_([0-9a-f]{48})$/.exec(header ?? ""); return m ? { prefix: m[1], secret: m[2] } : null; }
export const hashOk = (secret: string, hash: string) => { const a = Buffer.from(sha(secret)), b = Buffer.from(hash); return a.length === b.length && timingSafeEqual(a, b); };
/** Checks the bearer key, the organization's status and a 60-requests-per-minute limit. Returns the organization or a ready-made error response. */
export async function apiAuth(req: Request): Promise<{ orgId: string; keyId: string } | Response> {
  const k = parseKey(req.headers.get("authorization")), bad = () => Response.json({ error: "Missing or invalid API key" }, { status: 401 }); if (!k) return bad();
  const row = await db.apiKey.findUnique({ where: { prefix: k.prefix }, include: { org: { select: { suspended: true } } } });
  if (!row || row.revokedAt || !hashOk(k.secret, row.hash)) return bad();
  if (row.org.suspended) return Response.json({ error: "This organization is suspended" }, { status: 403 });
  if (!(await allow(`api:${row.id}`, 60, 60_000))) return Response.json({ error: "Rate limit: 60 requests per minute" }, { status: 429 });
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) await db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { orgId: row.orgId, keyId: row.id };
}
