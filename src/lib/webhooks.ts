import { createHmac, randomBytes, randomUUID } from "crypto";
import https from "https";
import net from "net";
import { lookup } from "dns/promises";
import { after } from "next/server";
import { db } from "./db"; import { runAutomations } from "./automation";

export const EVENTS: [string, string][] = [["order.created", "Order created"], ["order.confirmed", "Order confirmed (stock reserved)"], ["order.dispatched", "Order dispatched"], ["order.cancelled", "Order cancelled"],
  ["invoice.created", "Invoice created"], ["payment.received", "Payment received"], ["stock.low", "Stock low"], ["goods.received", "Goods received"]];
export const EVENT_KEYS = EVENTS.map((e) => e[0]);
export const newSecret = () => `whsec_${randomBytes(24).toString("hex")}`;
export const sign = (secret: string, ts: string, body: string) => createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

/** True for any address a webhook must never reach: loopback, private, link-local (cloud metadata), CGNAT, multicast, reserved, and IPv6 equivalents. */
export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip); if (!v) return true;
  if (v === 4) { const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)); }
  const x = ip.toLowerCase(), mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (mapped) return isPrivateIp(mapped[1]);
  return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff") || x.startsWith("64:ff9b") || x.startsWith("2001:db8") || x.startsWith("2002:") || x.startsWith("::ffff:");
}
/** Cheap checks that need no network: https only, no credentials, standard ports, no obviously internal names. */
export function checkUrlShape(raw: string): URL {
  let u: URL; try { u = new URL(raw); } catch { throw new Error("Enter a full URL, for example https://example.com/hooks"); }
  const dev = process.env.NODE_ENV !== "production";
  if (u.protocol !== "https:" && !(dev && u.protocol === "http:")) throw new Error("The URL must start with https://");
  if (u.username || u.password) throw new Error("Don't put a username or password in the URL");
  if (raw.length > 300) throw new Error("That URL is too long");
  if (u.port && !["443", "8443", ...(dev ? ["80", "8080"] : [])].includes(u.port)) throw new Error("Only ports 443 and 8443 are allowed");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !net.isIP(h.replace(/^\[|\]$/g, ""))) throw new Error("That address points to an internal network");
  return u;
}
/** Validates the URL and resolves it ONCE. The delivery connects to this exact IP (pinned), so DNS tricks can't redirect it inside your network later. */
export async function resolveSafe(raw: string) {
  const u = checkUrlShape(raw), host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true }).catch(() => { throw new Error("We couldn't find that host. Check the URL"); });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("That address points to a private or internal network");
  return { u, host, port: Number(u.port) || (u.protocol === "http:" ? 80 : 443), ip: addrs[0].address, family: addrs[0].family as 4 | 6 };
}
function postPinned(t: Awaited<ReturnType<typeof resolveSafe>>, body: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: t.host, port: t.port, path: t.u.pathname + t.u.search, method: "POST", timeout: 5000, servername: net.isIP(t.host) ? undefined : t.host,
      headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      lookup: ((_h: string, o: any, cb: any) => (o?.all ? cb(null, [{ address: t.ip, family: t.family }]) : cb(null, t.ip, t.family))) as any }, (r) => { r.resume(); r.on("end", () => resolve(r.statusCode ?? 0)); });
    req.on("timeout", () => req.destroy(new Error("Timed out after 5 seconds"))); req.on("error", reject); req.end(body); // redirects are never followed
  });
}

const BACKOFF = [60, 300, 1800, 7200, 43200]; // seconds between attempts; 5 attempts in total
/** One delivery attempt. A lease on the row prevents two workers sending the same event at once. */
export async function deliver(id: string) {
  const claim = await db.webhookDelivery.updateMany({ where: { id, status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] }, data: { nextAttemptAt: new Date(Date.now() + 120_000) } });
  if (claim.count !== 1) return;
  const d = await db.webhookDelivery.findUnique({ where: { id }, include: { webhook: true } }); if (!d) return;
  let code: number | null = null, err: string | null = null;
  if (!d.webhook.active) err = "Webhook is disabled";
  else try {
    const t = await resolveSafe(d.webhook.url), body = JSON.stringify(d.payload), ts = String(Math.floor(Date.now() / 1000));
    code = await postPinned(t, body, { "Content-Type": "application/json", "User-Agent": "Direct2Hub-Webhooks/1", "X-D2H-Event": d.event, "X-D2H-Delivery": d.id, "X-D2H-Timestamp": ts, "X-D2H-Signature": `sha256=${sign(d.webhook.secret, ts, body)}` });
    if (code < 200 || code >= 300) err = `The receiver answered HTTP ${code}`;
  } catch (e: any) { err = String(e?.message ?? e).slice(0, 200); }
  const attempts = d.attempts + 1, ok = !err, final = ok || attempts >= BACKOFF.length || err === "Webhook is disabled";
  await db.webhookDelivery.update({ where: { id }, data: { attempts, responseCode: code, error: err, status: ok ? "SUCCESS" : final ? "FAILED" : "PENDING", nextAttemptAt: final ? null : new Date(Date.now() + BACKOFF[attempts - 1] * 1000), deliveredAt: ok ? new Date() : null } });
  if (ok) { if (d.webhook.failures) await db.webhook.update({ where: { id: d.webhookId }, data: { failures: 0 } }); }
  else if (d.webhook.active) { const w = await db.webhook.update({ where: { id: d.webhookId }, data: { failures: { increment: 1 } } });
    if (w.failures >= 20) { await db.webhook.update({ where: { id: w.id }, data: { active: false } }); await db.notification.create({ data: { orgId: w.orgId, kind: "webhook", title: "A webhook was switched off", body: `${new URL(w.url).host} failed 20 times in a row`, href: "/webhooks" } }); } }
}
/** Retries everything that is due. Called by the cron route and opportunistically when the Webhooks page opens. */
export async function processDue(limit = 20) {
  const now = new Date(), due = await db.webhookDelivery.findMany({ where: { status: "PENDING", OR: [{ nextAttemptAt: { lte: now } }, { nextAttemptAt: null, createdAt: { lt: new Date(Date.now() - 60_000) } }] }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  for (const x of due) await deliver(x.id); return due.length;
}
/** Queues an event for every active webhook subscribed to it, then sends after the response is returned. Never throws into the caller's action. */
export async function emit(orgId: string, event: string, data: unknown) {
  try {
    const hooks = await db.webhook.findMany({ where: { orgId, active: true, events: { has: event } }, select: { id: true } });     const ids: string[] = [];
    for (const h of hooks) ids.push((await db.webhookDelivery.create({ data: { orgId, webhookId: h.id, event, payload: { id: randomUUID(), event, createdAt: new Date().toISOString(), data: data as any } } })).id);
    const run = async () => { await Promise.all(ids.map(deliver)).catch(() => {}); await runAutomations(orgId, event, data).catch((e) => console.error("automation failed", e?.message)); };
    try { after(run); } catch { void run(); }
  } catch (e) { console.error("webhook emit failed", (e as Error).message); }
}
/** Order events carry the order as it is right now (read after the change is saved). */
export async function emitOrder(event: string, orgId: string, orderId: string) {
  try {
    const o = await db.order.findFirst({ where: { id: orderId, orgId }, include: { lines: { include: { product: true } } } }); if (!o) return;
    await emit(orgId, event, { id: o.id, number: o.number, status: o.status, paymentStatus: o.paymentStatus, customer: o.customer, total: Number(o.total), lines: o.lines.map((l) => ({ sku: l.product.sku, name: l.product.name, qty: l.qty, unitPrice: Number(l.unitPrice) })) });
  } catch (e) { console.error("emitOrder failed", (e as Error).message); }
}
