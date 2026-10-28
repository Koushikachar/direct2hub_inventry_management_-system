const hits = new Map<string, number[]>();
/** True if this call is within the limit. Uses Upstash Redis when configured (shared across servers), otherwise per-instance memory. */
export async function allow(key: string, max: number, ms: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL, tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && tok) { try { const r: any = await fetch(`${url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: JSON.stringify([["INCR", `rl:${key}`], ["PEXPIRE", `rl:${key}`, ms, "NX"]]) }).then((x) => x.json()); const n = Number(r?.[0]?.result); if (!Number.isNaN(n)) return n <= max; } catch { /* fall back */ } }
  const now = Date.now(), arr = (hits.get(key) ?? []).filter((t) => now - t < ms); if (arr.length >= max) return false;
  arr.push(now); hits.set(key, arr); if (hits.size > 5000) hits.clear(); return true;
}
