"use server";
import { redirect } from "next/navigation"; import { revalidatePath } from "next/cache"; import { z } from "zod"; import { randomUUID } from "crypto";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { sendMail } from "@/lib/mail"; import { encrypt, encryptionReady } from "@/lib/secrets"; import { esc } from "@/lib/billing"; import { invNo } from "@/lib/gst";
import { gatewayFor, rzpCheckKeys, rzpCreateLink, rzpGetLink, applyOnlinePayment } from "@/lib/paylinks";
const fail = (p: string, m: string): never => redirect(`${p}${p.includes("?") ? "&" : "?"}e=${encodeURIComponent(m)}`);
const done = (p: string, m: string): never => redirect(`${p}${p.includes("?") ? "&" : "?"}ok=${encodeURIComponent(m)}`);
async function who(back: string, roles: string[]) { const c = await ctx(); if (!roles.includes(c.role)) fail(back, "You don't have permission to do that"); return c; }
const MONEY = ["OWNER", "ACCOUNTANT", "ORDER_STAFF"];

/** Owner stores their own Razorpay keys. They are verified against Razorpay, encrypted, and never shown again. */
export async function saveGateway(fd: FormData) {
  const c = await who("/settings", ["OWNER"]); if (!encryptionReady()) fail("/settings", "Encrypted storage isn't set up on this server (APP_ENC_KEY). Ask the platform admin");
  const p = z.object({ keyId: z.string().trim().regex(/^rzp_(live|test)_[A-Za-z0-9]{8,30}$/, "key"), secret: z.string().trim().max(80).optional(), webhook: z.string().trim().min(8).max(100).optional().or(z.literal("")) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/settings", "The Key ID should look like rzp_live_XXXXXXXXXXXX (or rzp_test_…). Webhook secrets need 8+ characters");
  const d = p.data!, cur = await db.paymentGateway.findUnique({ where: { orgId: c.orgId } });
  if (!d.secret && !cur) fail("/settings", "Enter the Key Secret"); const secret = d.secret || (await gatewayFor(c.orgId))?.secret; if (!secret) fail("/settings", "Enter the Key Secret again");
  const ok = await rzpCheckKeys({ keyId: d.keyId, secret: secret!, webhookSecret: null }); if (!ok.ok) fail("/settings", `Razorpay didn't accept these keys: ${ok.error}`);
  const data = { provider: "RAZORPAY", keyId: d.keyId, ...(d.secret ? { secretEnc: encrypt(d.secret) } : {}), ...(d.webhook ? { webhookSecretEnc: encrypt(d.webhook) } : {}) };
  await db.paymentGateway.upsert({ where: { orgId: c.orgId }, create: { orgId: c.orgId, ...data, secretEnc: encrypt(secret!) }, update: data });
  await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "gateway.saved", detail: { keyId: d.keyId } } });
  revalidatePath("/settings"); done("/settings", "Razorpay connected. Now add the webhook in your Razorpay dashboard (details below).");
}
export async function removeGateway() {
  const c = await who("/settings", ["OWNER"]); await db.paymentGateway.deleteMany({ where: { orgId: c.orgId } });
  await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "gateway.removed" } }); revalidatePath("/settings"); done("/settings", "Razorpay disconnected");
}

async function invoiceFor(id: string, orgId: string) {
  const inv = await db.invoice.findFirst({ where: { id, orgId }, include: { payments: { select: { amount: true } }, creditNotes: { select: { total: true } }, order: { include: { customerRec: true } } } });
  if (!inv) return null; const due = Math.round(Number(inv.total) * 100) - inv.payments.reduce((s, x) => s + Math.round(Number(x.amount) * 100), 0) - inv.creditNotes.reduce((s, x) => s + Math.round(Number(x.total) * 100), 0); return { inv, due };
}
/** Creates (or reuses) a Razorpay payment link for what is still owed on the invoice. */
export async function createPayLink(fd: FormData) {
  const id = String(fd.get("invoiceId")), back = `/invoices/${id}`, c = await who(back, MONEY), g = await gatewayFor(c.orgId); if (!g) fail(back, "Connect your Razorpay account in Settings first");
  const f = await invoiceFor(id, c.orgId); if (!f) fail("/invoices", "Invoice not found"); const { inv, due } = f!; if (due < 100) fail(back, "Nothing is due on this invoice");
  const live = await db.invoicePayLink.findFirst({ where: { orgId: c.orgId, invoiceId: id, status: "CREATED", amount: due } }); if (live) done(back, "A payment link for this amount already exists");
  const cust = inv.order.customerRec, r = await rzpCreateLink(g!, { paise: due, ref: randomUUID(), description: `Invoice ${invNo(inv.number)}`, name: inv.customerName, email: cust?.email, phone: cust?.phone });
  if (!r.ok) return fail(back, `Couldn't create the link: ${r.error}`);
  await db.invoicePayLink.updateMany({ where: { orgId: c.orgId, invoiceId: id, status: "CREATED" }, data: { status: "CANCELLED" } }); // older links for other amounts are no longer offered
  await db.invoicePayLink.create({ data: { orgId: c.orgId, invoiceId: id, providerLinkId: r.data.id, url: r.data.url, amount: due } });
  revalidatePath(back); done(back, "Payment link created");
}
/** Asks Razorpay whether the link was paid (a backup for when the webhook isn't set up or was missed). */
export async function refreshPayLink(fd: FormData) {
  const id = String(fd.get("invoiceId")), back = `/invoices/${id}`, c = await who(back, MONEY), g = await gatewayFor(c.orgId); if (!g) fail(back, "Connect your Razorpay account in Settings first");
  const links = await db.invoicePayLink.findMany({ where: { orgId: c.orgId, invoiceId: id, status: "CREATED" }, take: 5 }); let got = 0;
  for (const l of links) { const r = await rzpGetLink(g!, l.providerLinkId); if (!r.ok) return fail(back, `Couldn't check with Razorpay: ${r.error}`);
    if (r.data.status === "paid" && r.data.amountPaid === l.amount) { const a = await applyOnlinePayment({ orgId: c.orgId, invoiceId: id, linkId: l.id, paise: l.amount, paymentId: r.data.paymentId ?? l.providerLinkId }); got += a.applied; } }
  revalidatePath(back); revalidatePath("/invoices"); done(back, got ? "Payment received and recorded" : "No payment yet");
}
export async function emailPayLink(fd: FormData) {
  const id = String(fd.get("invoiceId")), back = `/invoices/${id}`, c = await who(back, MONEY);
  const hour = await db.auditLog.count({ where: { orgId: c.orgId, actorId: c.user.id, action: "invoice.paylink_emailed", createdAt: { gt: new Date(Date.now() - 3600_000) } } }); if (hour >= 20) fail(back, "Too many emails sent in the last hour. Try again later");
  const link = await db.invoicePayLink.findFirst({ where: { orgId: c.orgId, invoiceId: id, status: "CREATED" }, orderBy: { createdAt: "desc" } }), f = await invoiceFor(id, c.orgId); if (!link || !f) fail(back, "Create a payment link first");
  const email = f!.inv.order.customerRec?.email; if (!email) fail(back, "This customer has no email address"); const org = await db.organization.findUnique({ where: { id: c.orgId } });
  await sendMail({ to: email!, subject: `Pay invoice ${invNo(f!.inv.number)} online`, html: `<p>Hello ${esc(f!.inv.customerName)},</p><p>You can pay invoice <b>${invNo(f!.inv.number)}</b> (₹${(link!.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}) online using UPI, card or netbanking:</p><p><a href="${esc(link!.url)}">Pay now</a></p><p>Thank you,<br/>${esc(org?.name ?? "")}</p>` });
  await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "invoice.paylink_emailed", detail: { invoice: f!.inv.number } } }); done(back, "Payment link emailed to the customer");
}
