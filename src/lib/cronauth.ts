import { createHash, timingSafeEqual } from "crypto";
/** True only when the request carries `Authorization: Bearer $CRON_SECRET`. Compared in constant time; refuses everything when CRON_SECRET is unset. */
export function bearerOk(req: Request, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const a = createHash("sha256").update(req.headers.get("authorization") ?? "").digest(), b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}
