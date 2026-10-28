import type { Prisma } from "@prisma/client";
/** Pure helpers for batch and serial tracking, plus the first-expiry-first-out allocation used at dispatch. */
export const SERIAL_RE = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,59}$/;
/** Turns pasted text (one per line, or comma/semicolon separated) into a clean list. `bad` = not allowed characters or too long; `dups` = repeated within the paste. */
export function parseSerials(text: string) {
  const seen = new Set<string>(), list: string[] = [], dups: string[] = [], bad: string[] = [];
  for (const raw of text.split(/[\n\r,;]+/)) { const s = raw.trim(); if (!s) continue; if (!SERIAL_RE.test(s)) { bad.push(s); continue; } if (seen.has(s)) { dups.push(s); continue; } seen.add(s); list.push(s); }
  return { list, dups, bad };
}
export type ExpiryState = "none" | "ok" | "soon" | "expired";
/** Dates are compared as whole days (a batch expiring today is still sellable today). */
export function expiryState(expiresOn: Date | null, now = new Date(), soonDays = 30): ExpiryState {
  if (!expiresOn) return "none"; const day = (d: Date) => Math.floor(d.getTime() / 864e5), left = day(expiresOn) - day(now);
  return left < 0 ? "expired" : left <= soonDays ? "soon" : "ok";
}
/** Takes `qty` units for an order from batches: earliest expiry first, never an expired batch. Returns how many units were covered by batches; the rest is stock that was never assigned to a batch (lenient on purpose, so old stock still ships). */
export async function allocateBatches(tx: Prisma.TransactionClient, a: { orgId: string; productId: string; warehouseId: string; qty: number; orderId: string }) {
  const today = new Date(new Date().toISOString().slice(0, 10)); let left = a.qty;
  const batches = await tx.batch.findMany({ where: { orgId: a.orgId, productId: a.productId, warehouseId: a.warehouseId, qty: { gt: 0 }, OR: [{ expiresOn: null }, { expiresOn: { gte: today } }] }, orderBy: [{ expiresOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] });
  for (const b of batches) {
    if (left <= 0) break; const take = Math.min(b.qty, left);
    const n = await tx.$executeRaw`UPDATE "Batch" SET qty = qty - ${take} WHERE id=${b.id} AND qty >= ${take}`;
    if (n === 1) { await tx.batchAllocation.create({ data: { orgId: a.orgId, orderId: a.orderId, batchId: b.id, productId: a.productId, qty: take } }); left -= take; }
  }
  return a.qty - left;
}
