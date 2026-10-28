import { db } from "@/lib/db"; import { verifyRazorpayWebhook } from "@/lib/billing"; import { gatewayFor, applyOnlinePayment } from "@/lib/paylinks"; import { allow } from "@/lib/ratelimit";
export const dynamic = "force-dynamic";
/** Each business points its own Razorpay webhook (event payment_link.paid) at /api/pay/razorpay/webhook/<its org id>, signed with the webhook secret it saved in Settings. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  // Unauthenticated endpoint that decrypts a stored secret: throttle per caller and refuse oversized bodies before doing any work.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!(await allow(`pay-wh:${ip}`, 120, 60_000))) return new Response("Too many requests", { status: 429 });
  const { orgId } = await params, raw = await req.text(); if (raw.length > 200_000) return new Response("Payload too large", { status: 413 });
  const g = await gatewayFor(orgId);
  if (!g?.webhookSecret || !verifyRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"), g.webhookSecret)) return new Response("bad signature", { status: 400 });
  let ev: any; try { ev = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  if (ev?.event !== "payment_link.paid") return Response.json({ ok: true, ignored: true });
  const lk = ev?.payload?.payment_link?.entity, pay = ev?.payload?.payment?.entity, link = lk?.id ? await db.invoicePayLink.findFirst({ where: { orgId, providerLinkId: String(lk.id) } }) : null;
  if (!link) return Response.json({ ok: true, unmatched: true });
  if (Number(lk.amount_paid) !== link.amount) { console.error("online payment amount mismatch", link.id); return Response.json({ ok: true, mismatch: true }); }
  await applyOnlinePayment({ orgId, invoiceId: link.invoiceId, linkId: link.id, paise: link.amount, paymentId: String(pay?.id ?? link.providerLinkId) });
  return Response.json({ ok: true });
}
