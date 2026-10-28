"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { ctx } from "@/lib/ctx";
import { reserveMany, receiveLine } from "@/lib/inventory";
import { expandLines } from "@/lib/kits"; import { allocateBatches, parseSerials } from "@/lib/tracking"; import { parseOptions, variantCombos } from "@/lib/variants";
import { notifyLow } from "@/lib/notify";
import { checkPassword } from "@/lib/password";
import { loadDemo, removeDemo } from "@/lib/demo";
import { buildInvoice, GSTIN_RE, GST_RATES, listPrice, invNo, type InvLine } from "@/lib/gst";
import { checkLimit } from "@/lib/plan"; import { uploadImage, imagesReady } from "@/lib/images";
import { cookies, headers } from "next/headers";
import { randomBytes, createHash } from "crypto";
import { sendMail } from "@/lib/mail"; import { emit, emitOrder, resolveSafe, deliver, newSecret, EVENT_KEYS } from "@/lib/webhooks"; import { OPS } from "@/lib/rules"; import { firstUse } from "@/lib/idempotency"; import { CODES, invoiceFx } from "@/lib/currency"; import { fulfilBackorders, tryReserve, canDispatch } from "@/lib/backorders"; import { encrypt, encryptionReady } from "@/lib/secrets"; import { newKey } from "@/lib/apikeys"; import { validShop, pingShopify, syncShopify } from "@/lib/shopify";
import { getUser } from "@/lib/auth";
import { sbServer } from "@/lib/supabase";
import type { Role } from "@prisma/client";

const fail = (p: string, m: string): never => redirect(`${p}${p.includes("?") ? "&" : "?"}e=${encodeURIComponent(m)}`);
const STOCK: Role[] = ["OWNER", "INVENTORY_MANAGER"], SALES: Role[] = ["OWNER", "INVENTORY_MANAGER", "ORDER_STAFF"], BUY: Role[] = ["OWNER", "INVENTORY_MANAGER", "ACCOUNTANT"];
async function guard(roles: Role[], back: string) { const c = await ctx(); if (!roles.includes(c.role)) fail(back, "You don't have permission for this action"); return c; }
/** The warehouse orders, receipts and returns work against: the one marked default, else the oldest. Move stock between locations with a transfer. */
const wh = (orgId: string) => db.warehouse.findFirstOrThrow({ where: { orgId }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] });
const creds = z.object({ email: z.string().email(), password: z.string().min(8) });

export async function signIn(fd: FormData) {
  await gate("/login", fd, "login", 5);
  const p = creds.safeParse(Object.fromEntries(fd)); if (!p.success) fail("/login", "Enter a valid email and a password of 8+ characters");
  const { error } = await (await sbServer()).auth.signInWithPassword(p.data!);
  if (error) { if (/not confirmed/i.test(error.message)) redirect(`/verify?email=${encodeURIComponent(p.data!.email)}&e=${encodeURIComponent("Verify your email first. We can send the link again")}`); fail("/login", error.message); }
  redirect("/dashboard");
}
const SITE = () => process.env.NEXT_PUBLIC_SITE_URL;
export async function signUp(fd: FormData) {
  await gate("/register", fd, "register", 5);
  const p = z.object({ name: z.string().trim().min(2), email: z.string().trim().email(), password: z.string().min(12), confirm: z.string() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/register", "Enter your name, a valid email and a password of 12+ characters");
  if (p.data!.password !== p.data!.confirm) fail("/register", "The two passwords don't match");
  const weak = await checkPassword(p.data!.password); if (weak) fail("/register", weak);
  const { data, error } = await (await sbServer()).auth.signUp({ email: p.data!.email, password: p.data!.password, options: { data: { name: p.data!.name }, emailRedirectTo: `${SITE()}/auth/callback` } });
  if (error) fail("/register", error.message);
  // An already-registered email gets exactly the same response as a new one (no account enumeration).
  if (data.session) redirect("/onboarding"); // email confirmation is switched off in Supabase
  redirect(`/verify?email=${encodeURIComponent(p.data!.email)}`);
}
export async function resendVerification(fd: FormData) {
  await throttle("/verify", `resend:${await ip()}`, 5);
  const email = z.string().email().safeParse(fd.get("email")); if (!email.success) fail("/register", "Enter a valid email");
  const { error } = await (await sbServer()).auth.resend({ type: "signup", email: email.data!, options: { emailRedirectTo: `${SITE()}/auth/callback` } });
  const q = encodeURIComponent(email.data!);
  redirect(error ? `/verify?email=${q}&e=${encodeURIComponent(error.message)}` : `/verify?email=${q}&ok=1`);
}
/** Sign-up by typing the code from the email (works when the link opens in a different app or the mail scanner has already used it). Needs {{ .Token }} in Supabase's "Confirm signup" email template. */
export async function verifyEmailCode(fd: FormData) {
  await throttle("/verify", `otp:${await ip()}`, 10);
  const p = z.object({ email: z.string().email(), token: z.string().trim().regex(/^\d{6,10}$/) }).safeParse({ email: fd.get("email"), token: String(fd.get("token") ?? "").replace(/\s+/g, "") });
  const q = encodeURIComponent(String(fd.get("email") ?? "")); if (!p.success) redirect(`/verify?email=${q}&e=${encodeURIComponent("Enter the numeric code from the email")}`);
  const { error } = await (await sbServer()).auth.verifyOtp({ email: p.data!.email, token: p.data!.token, type: "signup" });
  if (error) redirect(`/verify?email=${q}&e=${encodeURIComponent("That code is wrong or has expired. Request a new one below.")}`);
  redirect("/onboarding");
}
export async function signOut() { await (await sbServer()).auth.signOut(); redirect("/login"); }

export async function createOrg(fd: FormData) {
  const u = await getUser(); if (!u) redirect("/login"); // getUser() only returns people with a verified email who have passed the second step (if they use one)
  const name = z.string().trim().min(2).safeParse(fd.get("name")); if (!name.success) fail("/onboarding", "Enter your business name");
  await db.organization.create({ data: { name: name.data!, warehouses: { create: { name: "Main warehouse", isDefault: true } }, members: { create: { userId: u.id, role: "OWNER" } } } });
  redirect("/dashboard");
}

/** A picture is optional. Accepts a plain https link or, when image storage isn't set up, a small compressed image (data URL, at most ~150 KB) made by the browser. */
const MAX_DATA_IMAGE = 150_000;
const safeImageLink = (v: string) => {
  if (v.startsWith("data:")) return v.length <= MAX_DATA_IMAGE && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;
  try { const u = new URL(v); return u.protocol === "https:" && v.length <= 500 ? u.toString() : null; } catch { return null; }
};
export async function addProduct(fd: FormData) {
  const c = await guard(STOCK, "/products");
  const p = z.object({ sku: z.string().trim().min(1), name: z.string().trim().min(1), price: z.coerce.number().min(0), cost: z.coerce.number().min(0),
    reorder: z.coerce.number().int().min(0), opening: z.coerce.number().int().min(0), taxRate: z.coerce.number().refine((v) => GST_RATES.includes(v)), barcode: z.string().trim().max(64).optional(), unit: z.string().trim().min(1).max(12).default("pcs"), tracking: z.enum(["NONE", "BATCH", "SERIAL"]).default("NONE"), description: z.string().trim().max(2000).optional(), imageUrl: z.string().trim().max(150_000).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/products", `Check the ${String(p.error.issues[0].path[0])} field`);
  const d = p.data!, w = await wh(c.orgId);
  const link = d.imageUrl ? safeImageLink(d.imageUrl) : null; if (d.imageUrl && !link) fail("/products", "That picture couldn't be used. Choose a JPG, PNG or WebP picture, or paste an https:// link. A picture is optional");
  const lim = await checkLimit(c.orgId, "products", 1); if (lim) fail("/products", lim);
  try {
    await db.$transaction(async (tx) => {
      const pr = await tx.product.create({ data: { orgId: c.orgId, sku: d.sku, name: d.name, price: d.price, unitCost: d.cost, reorderAt: d.reorder, taxRate: d.taxRate, barcode: d.barcode || null, unit: d.unit, tracking: d.tracking, description: d.description || null, imageUrl: link } });
      await tx.stockBalance.create({ data: { orgId: c.orgId, productId: pr.id, warehouseId: w.id, sellable: d.opening } });
      if (d.opening > 0) await tx.stockMovement.create({ data: { orgId: c.orgId, productId: pr.id, warehouseId: w.id, type: "OPENING", qty: d.opening, actorId: c.user.id, idempotencyKey: `open:${pr.id}` } });
    });
  } catch (e: any) { if (e.code === "P2002") fail("/products", `That SKU or barcode already exists in your catalog`); throw e; }
  const np = await db.product.findFirst({ where: { orgId: c.orgId, sku: d.sku }, select: { id: true } }); if (np) await notifyLow(c.orgId, [np.id]);
  const img = fd.get("image"); let imgErr = ""; // the picture is optional: the product is already saved, so a failed upload only adds a note
  if (np && img instanceof File && img.size > 0 && imagesReady()) { try { const up = await uploadImage(img, c.orgId); await db.product.updateMany({ where: { id: np.id, orgId: c.orgId }, data: { imageUrl: up.url, imageId: up.id } }); } catch (e) { imgErr = `Product saved. The picture wasn't: ${e instanceof Error ? e.message : "upload failed"}. Add it from the product page.`; } }
  revalidatePath("/products"); if (imgErr) fail("/products", imgErr); redirect("/products");
}

export async function addSupplier(fd: FormData) {
  const c = await guard(BUY, "/suppliers");
  const p = z.object({ name: z.string().trim().min(1), phone: z.string().optional(), email: z.string().email().optional().or(z.literal("")) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/suppliers", "Enter a supplier name and a valid email");
  await db.supplier.create({ data: { orgId: c.orgId, name: p.data!.name, phone: p.data!.phone || null, email: p.data!.email || null } });
  revalidatePath("/suppliers"); redirect("/suppliers");
}
export async function addPO(fd: FormData) {
  const c = await guard(BUY, "/purchases");
  const p = z.object({ supplierId: z.string(), productId: z.string(), qty: z.coerce.number().int().positive(), unitCost: z.coerce.number().min(0), expectedOn: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/purchases", "Choose a supplier and product, then enter quantity and unit cost");
  if (!(await firstUse(c.orgId, fd.get("key"), "po"))) redirect("/purchases");
  const d = p.data!;
  const [s, pr] = await Promise.all([db.supplier.findFirst({ where: { id: d.supplierId, orgId: c.orgId } }), db.product.findFirst({ where: { id: d.productId, orgId: c.orgId } })]);
  if (!s || !pr) fail("/purchases", "Supplier or product not found");
  if (pr!.isKit) fail("/purchases", "A kit has no stock of its own. Order its component products instead");
  await db.purchaseOrder.create({ data: { orgId: c.orgId, supplierId: s!.id, status: "ORDERED", total: d.qty * d.unitCost, expectedOn: d.expectedOn ? new Date(d.expectedOn) : null,
    lines: { create: { productId: pr!.id, qty: d.qty, unitCost: d.unitCost } } } });
  revalidatePath("/purchases"); redirect("/purchases");
}
/** Stock only changes here, when goods are actually received. Safe to retry (same key) and to double-click. */
export async function receivePO(fd: FormData) {
  const c = await guard(STOCK, "/purchases");
  const p = z.object({ lineId: z.string(), qty: z.coerce.number().int().min(0), rejected: z.coerce.number().int().min(0).default(0), note: z.string().trim().max(300).optional(), key: z.string().min(8), batchCode: z.string().trim().max(40).optional(), expiresOn: z.string().optional(), serials: z.string().max(20000).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/purchases", "Enter whole numbers for the accepted and rejected quantities");
  const r = await receiveLine({ orgId: c.orgId, warehouseId: (await wh(c.orgId)).id, actorId: c.user.id, ...p.data! });
  if (!r.ok) fail("/purchases", r.error);
  const rl = await db.purchaseOrderLine.findFirst({ where: { id: p.data!.lineId, po: { orgId: c.orgId } }, select: { productId: true } }); if (rl) await notifyLow(c.orgId, [rl.productId]); // goods in: clears an old alert if stock is healthy again
  await fulfilBackorders(c.orgId, (await wh(c.orgId)).id, c.user.id); // waiting orders get the new stock, oldest first
  if (!("replay" in r && r.replay)) await emit(c.orgId, "goods.received", { lineId: p.data!.lineId, accepted: p.data!.qty, rejected: p.data!.rejected, note: p.data!.note ?? null });
  revalidatePath("/purchases"); revalidatePath("/inventory"); redirect("/purchases");
}

export async function createOrder(fd: FormData) {
  const c = await guard(SALES, "/orders");
  if (!(await firstUse(c.orgId, fd.get("key"), "order"))) redirect("/orders"); // the same form sent twice: the first one already created it
  const cid = String(fd.get("customerId") ?? ""), crec = cid ? await db.customer.findFirst({ where: { id: cid, orgId: c.orgId } }) : null;
  if (cid && !crec) fail("/orders", "Customer not found");
  const cname = crec?.name ?? String(fd.get("customer") ?? "").trim().slice(0, 120); if (!cname) fail("/orders", "Choose a customer or type a name");
  const want = new Map<string, number>();
  for (let i = 1; i <= 5; i++) {
    const id = String(fd.get(`p${i}`) ?? ""), q = Number(fd.get(`q${i}`)); if (!id) continue;
    if (!Number.isInteger(q) || q < 1) fail("/orders", `Line ${i}: quantity must be a whole number, 1 or more`);
    want.set(id, (want.get(id) ?? 0) + q);
  }
  if (!want.size) fail("/orders", "Add at least one product");
  const prs = await db.product.findMany({ where: { id: { in: [...want.keys()] }, orgId: c.orgId, archived: false } });
  if (prs.length !== want.size) fail("/orders", "One of the products wasn't found");
  const pl = crec?.priceListId ? await db.priceList.findFirst({ where: { id: crec.priceListId, orgId: c.orgId } }) : null, pct = pl ? Number(pl.percent) : 0; // the customer's price list, if any
  const unit = (p: (typeof prs)[number]) => (pl ? listPrice(Number(p.price), pct) : Number(p.price));
  const created = await db.$transaction(async (tx) => {
    const last = await tx.order.aggregate({ where: { orgId: c.orgId }, _max: { number: true } });
    return tx.order.create({ data: { orgId: c.orgId, number: (last._max.number ?? 0) + 1, customer: cname, customerId: crec?.id ?? null, total: Math.round(prs.reduce((t, p) => t + Math.round(unit(p) * 100) * want.get(p.id)!, 0)) / 100,
      lines: { create: prs.map((p) => ({ productId: p.id, qty: want.get(p.id)!, unitPrice: unit(p) })) } } });
  });
  await emitOrder("order.created", c.orgId, created.id);
  revalidatePath("/orders"); redirect("/orders");
}

export async function orderAct(fd: FormData) {
  const c = await guard(SALES, "/orders"), b0 = String(fd.get("back") ?? ""), back = /^\/orders(\/[\w-]+)?$/.test(b0) ? b0 : "/orders";
  const act = String(fd.get("act")), o = await db.order.findFirst({ where: { id: String(fd.get("id")), orgId: c.orgId }, include: { lines: true } });
  if (!o) fail(back, "Order not found");
  const w = await wh(c.orgId), O = o!;
  // Stock-level lines: a kit on the order is replaced by its components, so reserve / dispatch / release all work on real stock.
  const sl = await expandLines(c.orgId, O.lines.map(l => ({ id: l.id, productId: l.productId, qty: l.qty })));
  if (act === "confirm" && O.status === "DRAFT") {
    const r = await reserveMany({ orgId: c.orgId, warehouseId: w.id, actorId: c.user.id, orderId: O.id, lines: sl });
    if (!r.ok) {
      const allow = (await db.organization.findUnique({ where: { id: c.orgId }, select: { backorders: true } }))?.backorders;
      if (!allow || !r.error.startsWith("Not enough available stock")) fail(back, `Order #${O.number}: ${r.error}`);
      await db.order.update({ where: { id: O.id }, data: { status: "CONFIRMED", backordered: true } }); // waits for stock; holds nothing
      await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "order.backordered", detail: { order: O.number, reason: r.error } } });
    } else await db.order.update({ where: { id: O.id }, data: { status: "CONFIRMED" } });
  } else if (act === "dispatch" && O.status === "CONFIRMED" && O.backordered) {
    fail(back, `Order #${O.number} is waiting for stock. It can be dispatched once everything on it can be reserved.`);
  } else if (act === "dispatch" && canDispatch(O)) {
    const meta = new Map<string, { id: string; name: string; tracking: string }>((await db.product.findMany({ where: { id: { in: sl.map(l => l.productId) } }, select: { id: true, name: true, tracking: true } })).map(p => [p.id, p] as [string, { id: string; name: string; tracking: string }]));
    for (const l of sl) if (meta.get(l.productId)?.tracking === "SERIAL") { // serial-tracked goods must have exactly the right serial numbers assigned first
      const n = await db.serialNumber.count({ where: { orgId: c.orgId, orderLineId: l.id, status: "ASSIGNED" } });
      if (n !== l.qty) fail(back, `Assign ${l.qty} serial number(s) to ${meta.get(l.productId)!.name} before dispatching`);
    }
    await db.$transaction(async (tx) => { for (const l of sl) {
      const n = await tx.$executeRaw`UPDATE "StockBalance" SET sellable=sellable-${l.qty}, reserved=reserved-${l.qty} WHERE "orgId"=${c.orgId} AND "productId"=${l.productId} AND "warehouseId"=${w.id} AND reserved>=${l.qty}`;
      if (n === 0) throw new Error("Reservation missing");
      await tx.stockMovement.create({ data: { orgId: c.orgId, productId: l.productId, warehouseId: w.id, type: "DISPATCH", qty: l.qty, actorId: c.user.id, sourceRef: O.id, idempotencyKey: `disp:${l.id}` } });
      const t = meta.get(l.productId)?.tracking;
      if (t === "BATCH") await allocateBatches(tx, { orgId: c.orgId, productId: l.productId, warehouseId: w.id, qty: l.qty, orderId: O.id });
      else if (t === "SERIAL") await tx.serialNumber.updateMany({ where: { orgId: c.orgId, orderLineId: l.id, status: "ASSIGNED" }, data: { status: "SOLD", soldAt: new Date() } }); }
      await tx.order.update({ where: { id: O.id }, data: { status: "DISPATCHED" } }); });
  } else if (act === "cancel" && (O.status === "DRAFT" || O.status === "CONFIRMED")) {
    await db.$transaction(async (tx) => {
      if (O.status === "CONFIRMED" && !O.backordered) { for (const l of sl) { // a backordered order holds no stock, so there is nothing to release
        await tx.$executeRaw`UPDATE "StockBalance" SET reserved=reserved-${l.qty} WHERE "orgId"=${c.orgId} AND "productId"=${l.productId} AND "warehouseId"=${w.id} AND reserved>=${l.qty}`;
        await tx.stockMovement.create({ data: { orgId: c.orgId, productId: l.productId, warehouseId: w.id, type: "RELEASE", qty: l.qty, actorId: c.user.id, sourceRef: O.id, idempotencyKey: `rel:${l.id}` } }); }
        await tx.serialNumber.updateMany({ where: { orgId: c.orgId, orderId: O.id, status: "ASSIGNED" }, data: { status: "IN_STOCK", orderId: null, orderLineId: null } }); }
      await tx.order.update({ where: { id: O.id }, data: { status: "CANCELLED", backordered: false } }); });
  } else fail(back, O.status === "DISPATCHED" ? "Dispatched orders can't be cancelled. Log a return instead" : "That action isn't valid for this order's status");
  await notifyLow(c.orgId, sl.map(l => l.productId));
  await emitOrder(`order.${act === "confirm" ? "confirmed" : act === "dispatch" ? "dispatched" : "cancelled"}`, c.orgId, O.id);
  revalidatePath("/orders"); revalidatePath(back); redirect(back);
}

export async function logReturn(fd: FormData) {
  const c = await guard(SALES, "/returns");
  const p = z.object({ productId: z.string(), qty: z.coerce.number().int().positive(), reason: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/returns", "Choose a product and quantity");
  const rp = await db.product.findFirst({ where: { id: p.data!.productId, orgId: c.orgId } }); if (!rp) fail("/returns", "Product not found");
  if (rp!.isKit) fail("/returns", "Log the return against the products inside the kit, not the kit itself");
  await db.return.create({ data: { orgId: c.orgId, productId: p.data!.productId, qty: p.data!.qty, reason: p.data!.reason || null } });
  revalidatePath("/returns"); redirect("/returns");
}
/** Returns are inspected first: only RESTOCK adds sellable stock; DAMAGED goes to non-sellable. */
export async function inspectReturn(fd: FormData) {
  const c = await guard(STOCK, "/returns"), w = await wh(c.orgId), id = String(fd.get("id")), restock = fd.get("d") === "RESTOCK";
  await db.$transaction(async (tx) => {
    const r = await tx.return.findFirst({ where: { id, orgId: c.orgId, status: "PENDING" } }); if (!r) return;
    const claim = await tx.return.updateMany({ where: { id, status: "PENDING" }, data: { status: restock ? "RESTOCKED" : "DAMAGED" } }); if (claim.count !== 1) return;
    await tx.stockBalance.updateMany({ where: { orgId: c.orgId, productId: r.productId, warehouseId: w.id }, data: restock ? { sellable: { increment: r.qty } } : { damaged: { increment: r.qty } } });
    await tx.stockMovement.create({ data: { orgId: c.orgId, productId: r.productId, warehouseId: w.id, type: restock ? "RETURN_RESTOCK" : "DAMAGE", qty: r.qty, actorId: c.user.id, sourceRef: id, idempotencyKey: `ret:${id}` } });
  });
  const ret = await db.return.findFirst({ where: { id, orgId: c.orgId }, select: { productId: true } }); if (ret) await notifyLow(c.orgId, [ret.productId]);
  revalidatePath("/returns"); redirect("/returns");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function inviteStaff(fd: FormData) {
  const c = await guard(["OWNER"], "/settings");
  await throttle("/settings", `invite:${c.user.id}`, 10, 3600_000);
  const lim = await checkLimit(c.orgId, "members", 1); if (lim) fail("/settings", lim);
  const p = z.object({ email: z.string().trim().email(), role: z.enum(["INVENTORY_MANAGER", "ORDER_STAFF", "ACCOUNTANT", "ANALYST"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/settings", "Enter a valid email and choose a role");
  const token = randomBytes(32).toString("hex");
  const inv = await db.invitation.create({ data: { orgId: c.orgId, email: p.data!.email.toLowerCase(), role: p.data!.role, tokenHash: hash(token), expiresAt: new Date(Date.now() + 7 * 864e5) } });
  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/invite/${token}`;
  const m = await sendMail({ to: inv.email, subject: `You're invited to ${c.orgName} on Direct2Hub`,
    html: `<p>You've been invited to join <b>${esc(c.orgName)}</b> as ${inv.role.replace("_", " ").toLowerCase()}.</p><p><a href="${link}">Accept invitation</a> (valid for 7 days)</p>` });
  if (!m.ok) { await db.invitation.delete({ where: { id: inv.id } }); fail("/settings", `Invitation not sent: ${m.error}`); }
  await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "staff.invited", detail: { email: inv.email, role: inv.role } } });
  redirect(`/settings?ok=${encodeURIComponent(`Email accepted by the provider for ${inv.email}. If it doesn't arrive, check spam.`)}`);
}

export async function acceptInvite(fd: FormData) {
  const u = await getUser(); if (!u) redirect("/login"); // verified email only: an unverified sign-up for the invited address must never be able to take the invitation
  const inv = await db.invitation.findUnique({ where: { tokenHash: hash(String(fd.get("token"))) } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date()) fail("/onboarding", "This invitation is invalid or has expired");
  if (inv!.email !== u!.email.toLowerCase()) fail("/onboarding", "Sign in with the email address the invitation was sent to");
  await db.$transaction(async (tx) => {
    const claim = await tx.invitation.updateMany({ where: { id: inv!.id, usedAt: null }, data: { usedAt: new Date() } }); if (claim.count !== 1) return;
    await tx.membership.upsert({ where: { userId_orgId: { userId: u!.id, orgId: inv!.orgId } }, update: {}, create: { userId: u!.id, orgId: inv!.orgId, role: inv!.role } });
  });
  (await cookies()).set("org", inv!.orgId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/dashboard");
}

export async function setOrg(fd: FormData) {
  const user = await getUser(); if (!user) redirect("/login"); const id = String(fd.get("id"));
  if (!(await db.membership.findFirst({ where: { userId: user.id, orgId: id } }))) fail("/settings", "You're not a member of that organization");
  (await cookies()).set("org", id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/dashboard");
}

const ROLES5 = ["OWNER", "INVENTORY_MANAGER", "ORDER_STAFF", "ACCOUNTANT", "ANALYST"] as const;
export async function requestReset(fd: FormData) {
  await gate("/forgot", fd, "reset", 5);
  const email = z.string().trim().email().safeParse(fd.get("email")); if (!email.success) fail("/forgot", "Enter a valid email");
  await (await sbServer()).auth.resetPasswordForEmail(email.data!, { redirectTo: `${SITE()}/auth/callback?next=/reset` });
  redirect("/forgot?sent=1"); // same answer whether or not the account exists
}
export async function setPassword(fd: FormData) {
  const p = z.object({ password: z.string().min(12), confirm: z.string() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/reset", "Use a password of 12+ characters"); if (p.data!.password !== p.data!.confirm) fail("/reset", "The two passwords don't match");
  const weak = await checkPassword(p.data!.password); if (weak) fail("/reset", weak);
  const { error } = await (await sbServer()).auth.updateUser({ password: p.data!.password }); if (error) fail("/reset", error.message);
  redirect("/dashboard");
}
export async function adjustStock(fd: FormData) {
  const c = await guard(STOCK, "/inventory");
  const p = z.object({ productId: z.string(), dir: z.enum(["add", "remove"]), qty: z.coerce.number().int().positive(), reason: z.string().trim().min(3), key: z.string().min(8) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/inventory", "Choose a product and a whole quantity, and give a reason (3+ characters)");
  const d = p.data!, w = await wh(c.orgId), delta = d.dir === "add" ? d.qty : -d.qty;
  try {
    await db.$transaction(async (tx) => {
      const ap = await tx.product.findFirst({ where: { id: d.productId, orgId: c.orgId } }); if (!ap) throw new Error("NOPRODUCT"); if (ap.isKit) throw new Error("KIT");
      await tx.stockBalance.upsert({ where: { productId_warehouseId: { productId: d.productId, warehouseId: w.id } }, update: {}, create: { orgId: c.orgId, productId: d.productId, warehouseId: w.id } });
      const n = await tx.$executeRaw`UPDATE "StockBalance" SET sellable = sellable + ${delta} WHERE "orgId"=${c.orgId} AND "productId"=${d.productId} AND "warehouseId"=${w.id} AND sellable + ${delta} >= reserved`;
      if (n === 0) throw new Error("NEG");
      await tx.stockMovement.create({ data: { orgId: c.orgId, productId: d.productId, warehouseId: w.id, type: "ADJUST", qty: delta, reason: d.reason, actorId: c.user.id, idempotencyKey: `adj:${d.key}` } });
    });
  } catch (e: any) {
    if (e.message === "NEG") fail("/inventory", "That would take sellable stock below the quantity already reserved");
    if (e.message === "NOPRODUCT") fail("/inventory", "Product not found");
    if (e.message === "KIT") fail("/inventory", "A kit has no stock of its own. Adjust its component products");
    if (e.code !== "P2002") throw e; // P2002 = same adjustment submitted twice; already applied
  }
  await notifyLow(c.orgId, [d.productId]);
  revalidatePath("/inventory"); redirect("/inventory");
}
export async function updateProduct(fd: FormData) {
  const id = String(fd.get("id")), back = `/products/${id}`, c = await guard(STOCK, back);
  const p = z.object({ name: z.string().trim().min(1), hsn: z.string().trim().optional(), price: z.coerce.number().min(0), cost: z.coerce.number().min(0), reorder: z.coerce.number().int().min(0), taxRate: z.coerce.number().refine((v) => GST_RATES.includes(v)), barcode: z.string().trim().max(64).optional(), unit: z.string().trim().min(1).max(12).default("pcs"), tracking: z.enum(["NONE", "BATCH", "SERIAL"]).default("NONE"), description: z.string().trim().max(2000).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail(back, `Check the ${String(p.error.issues[0].path[0])} field`);
  const cur = await db.product.findFirst({ where: { id, orgId: c.orgId } }); if (cur?.isKit && p.data!.tracking !== "NONE") fail(back, "A kit has no stock of its own, so it can't be batch or serial tracked");
  if (cur && p.data!.tracking === "SERIAL" && cur.tracking !== "SERIAL" && (await db.kitComponent.count({ where: { componentId: id } }))) fail(back, "This product is part of a kit, and kit parts can't be serial tracked");
  if (p.data!.tracking !== "NONE" && (await db.bundleComponent.count({ where: { orgId: c.orgId, OR: [{ bundleId: id }, { componentId: id }] } }))) fail(back, "This product is used in Assembly, which only supports plain products. Remove it from Assembly first.");
  const r = await db.product.updateMany({ where: { id, orgId: c.orgId }, data: { unit: p.data!.unit, tracking: p.data!.tracking, name: p.data!.name, hsn: p.data!.hsn || null, price: p.data!.price, unitCost: p.data!.cost, reorderAt: p.data!.reorder, taxRate: p.data!.taxRate, barcode: p.data!.barcode || null, description: p.data!.description || null } });
  if (!r.count) fail("/products", "Product not found");
  await notifyLow(c.orgId, [id]); // a changed reorder level can make a product low (or healthy) straight away
  revalidatePath("/products"); redirect(`${back}?ok=${encodeURIComponent("Saved")}`);
}
export async function setArchived(fd: FormData) {
  const id = String(fd.get("id")), c = await guard(STOCK, `/products/${id}`), archived = fd.get("archived") === "1";
  await db.product.updateMany({ where: { id, orgId: c.orgId }, data: { archived } });
  revalidatePath("/products"); redirect(archived ? "/products" : `/products/${id}?ok=${encodeURIComponent("Restored")}`);
}
export async function changeRole(fd: FormData) {
  const c = await guard(["OWNER"], "/settings");
  const p = z.object({ id: z.string(), role: z.enum(ROLES5) }).safeParse(Object.fromEntries(fd)); if (!p.success) fail("/settings", "Choose a valid role");
  const m = await db.membership.findFirst({ where: { id: p.data!.id, orgId: c.orgId } }); if (!m) fail("/settings", "Member not found");
  if (m!.userId === c.user.id) fail("/settings", "You can't change your own role");
  await db.$transaction([db.membership.update({ where: { id: m!.id }, data: { role: p.data!.role } }), db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "staff.role_changed", detail: { membership: m!.id, to: p.data!.role } } })]);
  revalidatePath("/settings"); redirect("/settings");
}
export async function removeMember(fd: FormData) {
  const c = await guard(["OWNER"], "/settings"), id = String(fd.get("id"));
  const m = await db.membership.findFirst({ where: { id, orgId: c.orgId } }); if (!m) fail("/settings", "Member not found");
  if (m!.userId === c.user.id) fail("/settings", "You can't remove yourself");
  await db.$transaction([db.membership.delete({ where: { id } }), db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "staff.removed", detail: { membership: id } } })]);
  revalidatePath("/settings"); redirect("/settings");
}

// ---- abuse protection -------------------------------------------------------------------
// In-memory limiter: per server instance only. On Vercel/serverless use a shared store (e.g. Upstash Redis) for hard limits.
const hits = new Map<string, number[]>();
async function throttle(path: string, key: string, max: number, ms = 60_000) {
  const url = process.env.UPSTASH_REDIS_REST_URL, tok = process.env.UPSTASH_REDIS_REST_TOKEN; let n: number | null = null;
  if (url && tok) { // shared store (Upstash Redis REST): limits hold across serverless instances
    try { const r: any = await fetch(`${url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: JSON.stringify([["INCR", `rl:${key}`], ["PEXPIRE", `rl:${key}`, ms, "NX"]]) }).then((x) => x.json()); n = Number(r?.[0]?.result); } catch { n = null; }
  }
  if (n !== null && !Number.isNaN(n)) { if (n > max) fail(path, "Too many attempts. Please wait a few minutes and try again."); return; }
  const now = Date.now(), arr = (hits.get(key) ?? []).filter((t) => now - t < ms); // fallback: per-instance memory
  if (arr.length >= max) fail(path, "Too many attempts. Please wait a few minutes and try again.");
  arr.push(now); hits.set(key, arr); if (hits.size > 5000) hits.clear();
}
async function ip() { return (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "local"; }
/** Rate limit, then verify the Cloudflare Turnstile token when TURNSTILE_SECRET_KEY is set. */
async function gate(path: string, fd: FormData, name: string, max: number) {
  const who = await ip(), em = String(fd.get("email") ?? "").toLowerCase().slice(0, 100);
  await throttle(path, `${name}:${who}:${em}`, max, 15 * 60_000); await throttle(path, `${name}:${who}`, max * 4, 15 * 60_000);
  const secret = process.env.TURNSTILE_SECRET_KEY; if (!secret) return;
  const r: any = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret, response: String(fd.get("cf-turnstile-response") ?? ""), remoteip: await ip() }) }).then((x) => x.json()).catch(() => ({ success: false }));
  if (!r.success) fail(path, "Please complete the human-verification check and try again.");
}

/** Physical count: sets sellable stock to the counted number via a compare-and-set, so a concurrent stock change can't be overwritten. */
export async function recordCount(fd: FormData) {
  const c = await guard(STOCK, "/counts");
  const p = z.object({ productId: z.string(), counted: z.coerce.number().int().min(0), key: z.string().min(8) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/counts", "Choose a product and enter the counted quantity (a whole number, 0 or more)");
  const d = p.data!, w = await wh(c.orgId); let msg = "";
  try {
    await db.$transaction(async (tx) => {
      const b = await tx.stockBalance.findFirst({ where: { orgId: c.orgId, productId: d.productId, warehouseId: w.id } }); if (!b) throw new Error("NOBAL");
      const delta = d.counted - b.sellable;
      if (delta === 0) { msg = "The count matches the system. No adjustment needed."; return; }
      if (d.counted < b.reserved) throw new Error("RES");
      const n = await tx.$executeRaw`UPDATE "StockBalance" SET sellable=${d.counted} WHERE id=${b.id} AND sellable=${b.sellable}`; if (n === 0) throw new Error("CHANGED");
      await tx.stockMovement.create({ data: { orgId: c.orgId, productId: d.productId, warehouseId: w.id, type: "ADJUST", qty: delta, reason: `Stock count: system ${b.sellable}, counted ${d.counted}`, actorId: c.user.id, idempotencyKey: `cnt:${d.key}` } });
      msg = `Adjusted by ${delta > 0 ? "+" : ""}${delta} to match your count.`;
    });
  } catch (e: any) {
    if (e.message === "NOBAL") fail("/counts", "That product has no stock record yet");
    if (e.message === "RES") fail("/counts", "The counted quantity is below the units already reserved for orders. Resolve those orders first");
    if (e.message === "CHANGED") fail("/counts", "Stock changed while you were counting. Check the system quantity and count again");
    if (e.code === "P2002") msg = "That count was already recorded."; else throw e;
  }
  await notifyLow(c.orgId, [d.productId]);
  revalidatePath("/counts"); revalidatePath("/inventory"); redirect(`/counts?ok=${encodeURIComponent(msg)}`);
}

export async function setPayment(fd: FormData) {
  const c = await guard([...SALES, "ACCOUNTANT"], "/orders"), id = String(fd.get("id"));
  const st = z.enum(["UNPAID", "PARTIAL", "PAID", "REFUNDED"]).safeParse(fd.get("status")); if (!st.success) fail(`/orders/${id}`, "Choose a payment status");
  await db.order.updateMany({ where: { id, orgId: c.orgId }, data: { paymentStatus: st.data! } });
  revalidatePath(`/orders/${id}`); redirect(`/orders/${id}`);
}
export async function readNotification(fd: FormData) {
  const c = await ctx(), id = String(fd.get("id")), n = await db.notification.findFirst({ where: { id, orgId: c.orgId } });
  if (n && !n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  redirect(n?.href && n.href.startsWith("/") && !n.href.startsWith("//") ? n.href : "/notifications");
}
export async function readAll() {
  const c = await ctx(); await db.notification.updateMany({ where: { orgId: c.orgId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications"); redirect("/notifications");
}

const done = (m: string) => redirect(`/settings?ok=${encodeURIComponent(m)}`);
export async function loadSample() {
  const c = await guard(["OWNER"], "/settings"), r = await loadDemo(c.orgId, c.user.id);
  if (!r.ok) fail("/settings", r.error);
  revalidatePath("/", "layout"); done("Sample data added. Open the Dashboard, Orders and Inventory to explore it.");
}
export async function removeSample() {
  const c = await guard(["OWNER"], "/settings"), r = await removeDemo(c.orgId, c.user.id);
  if (!r.ok) fail("/settings", r.error);
  revalidatePath("/", "layout"); done("Sample data removed.");
}

// ---- customers, business profile, invoices, payments --------------------------------------
export async function addCustomer(fd: FormData) {
  const c = await guard([...SALES, "ACCOUNTANT"], "/customers");
  const p = z.object({ name: z.string().trim().min(1).max(120), phone: z.string().trim().max(30).optional(), email: z.string().trim().email().optional().or(z.literal("")),
    gstin: z.string().trim().toUpperCase().regex(GSTIN_RE).optional().or(z.literal("")), state: z.string().trim().max(60).optional(), address: z.string().trim().max(300).optional(), priceListId: z.string().optional(), currency: z.enum(CODES as [string, ...string[]]).default("INR") }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/customers", "Check the name, email and GSTIN (15 characters, e.g. 29ABCDE1234F1Z5)");
  if (!(await firstUse(c.orgId, fd.get("key"), "cust"))) redirect("/customers");
  const d = p.data!;
  if (d.priceListId && !(await db.priceList.findFirst({ where: { id: d.priceListId, orgId: c.orgId } }))) fail("/customers", "Price list not found");
  await db.customer.create({ data: { orgId: c.orgId, currency: d.currency, priceListId: d.priceListId || null, name: d.name, phone: d.phone || null, email: d.email || null, gstin: d.gstin || null, state: d.state || null, address: d.address || null } });
  revalidatePath("/customers"); redirect("/customers");
}
export async function updateOrgProfile(fd: FormData) {
  const c = await guard(["OWNER"], "/settings");
  const p = z.object({ gstin: z.string().trim().toUpperCase().regex(GSTIN_RE).optional().or(z.literal("")), state: z.string().trim().max(60).optional(), address: z.string().trim().max(300).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/settings", "GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5");
  await db.organization.update({ where: { id: c.orgId }, data: { gstin: p.data!.gstin || null, state: p.data!.state || null, address: p.data!.address || null } });
  revalidatePath("/settings"); done("Business details saved. They appear on your invoices.");
}
/** Issues a GST invoice from a confirmed/dispatched order. One invoice per order; lines are a snapshot. */
export async function createInvoice(fd: FormData) {
  const id = String(fd.get("orderId")), c = await guard([...SALES, "ACCOUNTANT"], `/orders/${id}`);
  const o = await db.order.findFirst({ where: { id, orgId: c.orgId }, include: { lines: { include: { product: true } }, customerRec: true, invoice: true } });
  if (!o) fail("/orders", "Order not found");
  const O = o!;
  if (O.invoice) redirect(`/invoices/${O.invoice.id}`);
  if (!["CONFIRMED", "DISPATCHED", "DELIVERED"].includes(O.status)) fail(`/orders/${id}`, "Confirm the order before invoicing it");
  const org = await db.organization.findUnique({ where: { id: c.orgId } }), cs = O.customerRec?.state ?? null, intra = !(org?.state && cs) || org.state === cs;
  const calc = buildInvoice(O.lines.map((l) => ({ name: l.product.name, hsn: l.product.hsn, qty: l.qty, rate: Number(l.unitPrice), taxRate: l.product.taxRate })), intra);
  const fx = await invoiceFx(c.orgId, O.customerRec?.currency ?? "INR"); // the rate is frozen on the invoice, so later rate changes never alter it
  let invId = "";
  try {
    invId = await db.$transaction(async (tx) => {
      const last = await tx.invoice.aggregate({ where: { orgId: c.orgId }, _max: { number: true } });
      const inv = await tx.invoice.create({ data: { orgId: c.orgId, number: (last._max.number ?? 0) + 1, orderId: O.id, customerName: O.customer, customerGstin: O.customerRec?.gstin ?? null, customerAddress: O.customerRec?.address ?? null,
        customerState: cs, intraState: intra, currency: fx.currency, fxRate: fx.rate, lines: calc.lines, subtotal: calc.subtotal, taxTotal: calc.tax, total: calc.total, dueOn: new Date(Date.now() + 15 * 864e5) } });
      await tx.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "invoice.created", detail: { invoice: inv.number, order: O.number } } });
      return inv.id;
    });
  } catch (e: any) { if (e.code !== "P2002") throw e; const ex = await db.invoice.findFirst({ where: { orderId: O.id, orgId: c.orgId } }); if (ex) redirect(`/invoices/${ex.id}`); throw e; }
  { const inv = await db.invoice.findUnique({ where: { id: invId } }); if (inv) await emit(c.orgId, "invoice.created", { id: inv.id, number: inv.number, order: O.number, customer: O.customer, subtotal: Number(inv.subtotal), tax: Number(inv.taxTotal), total: Number(inv.total) }); }
  revalidatePath("/invoices"); redirect(`/invoices/${invId}`);
}
/** Records money received against an invoice. The invoice row is locked so two payments can't overpay it; a double-click is ignored. */
export async function recordPayment(fd: FormData) {
  const id = String(fd.get("invoiceId")), back = `/invoices/${id}`, c = await guard([...SALES, "ACCOUNTANT"], back);
  const p = z.object({ amount: z.coerce.number().positive().max(100000000), method: z.enum(["CASH", "UPI", "BANK", "CARD", "CHEQUE"]), reference: z.string().trim().max(80).optional(), key: z.string().min(8) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail(back, "Enter an amount and choose a payment method");
  const d = p.data!; let err = "";
  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${id} AND "orgId"=${c.orgId} FOR UPDATE`;
      const inv = await tx.invoice.findFirst({ where: { id, orgId: c.orgId }, include: { payments: { select: { amount: true } }, creditNotes: { select: { total: true } } } }); if (!inv) { err = "Invoice not found"; return; }
      const paid = inv.payments.reduce((s, x) => s + Math.round(Number(x.amount) * 100), 0), total = Math.round(Number(inv.total) * 100) - inv.creditNotes.reduce((s, x) => s + Math.round(Number(x.total) * 100), 0), amt = Math.round(d.amount * 100); // credit notes lower what is owed
      if (amt > total - paid) { err = "That is more than the balance due"; return; }
      await tx.payment.create({ data: { orgId: c.orgId, invoiceId: id, amount: amt / 100, method: d.method, reference: d.reference || null, actorId: c.user.id, idempotencyKey: `pay:${d.key}` } });
      await tx.order.update({ where: { id: inv.orderId }, data: { paymentStatus: paid + amt >= total ? "PAID" : "PARTIAL" } });
    });
  } catch (e: any) { if (e.code !== "P2002") throw e; }
  if (err) fail(back, err);
  await emit(c.orgId, "payment.received", { invoiceId: id, amount: d.amount, method: d.method, reference: d.reference ?? null });
  revalidatePath(back); revalidatePath("/invoices"); redirect(`${back}?ok=${encodeURIComponent("Payment recorded")}`);
}

/** Credit note against an invoice (a GST-correct sales return). Quantities per line can't exceed what's still un-credited; the invoice row is locked so two notes can't over-credit it.
 *  It lowers the balance due. Physical stock goes back through the Returns screen (inspect, then restock or mark damaged). */
export async function createCreditNote(fd: FormData) {
  const id = String(fd.get("invoiceId")), back = `/invoices/${id}`, c = await guard([...SALES, "ACCOUNTANT"], back);
  const reason = z.string().trim().min(3).max(200).safeParse(fd.get("reason")); if (!reason.success) fail(back, "Give a reason for the credit note (3 to 200 characters)");
  if (!(await firstUse(c.orgId, fd.get("key"), "cn"))) redirect(back);
  let cnId = "";
  try {
    cnId = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${id} AND "orgId"=${c.orgId} FOR UPDATE`;
      const inv = await tx.invoice.findFirst({ where: { id, orgId: c.orgId }, include: { creditNotes: { select: { lines: true, total: true } }, payments: { select: { amount: true } } } }); if (!inv) throw new Error("NOINV");
      const lines = inv.lines as unknown as InvLine[], done = new Map<number, number>();
      for (const n of inv.creditNotes) for (const l of n.lines as unknown as { idx: number; qty: number }[]) done.set(l.idx, (done.get(l.idx) ?? 0) + l.qty);
      const items: { idx: number; name: string; hsn: string | null; qty: number; rate: number; taxRate: number }[] = [];
      lines.forEach((l, i) => { const raw = String(fd.get(`q${i}`) ?? "").trim(); if (!raw || raw === "0") return; const q = Number(raw);
        if (!Number.isInteger(q) || q < 1 || q > l.qty - (done.get(i) ?? 0)) throw new Error(`BADQTY:${l.name}`);
        items.push({ idx: i, name: l.name, hsn: l.hsn || null, qty: q, rate: l.rate, taxRate: l.taxRate }); });
      if (!items.length) throw new Error("NOITEMS");
      const calc = buildInvoice(items.map(({ idx, ...r }) => r), inv.intraState), last = await tx.creditNote.aggregate({ where: { orgId: c.orgId }, _max: { number: true } });
      const cn = await tx.creditNote.create({ data: { orgId: c.orgId, number: (last._max.number ?? 0) + 1, invoiceId: id, reason: reason.data!, lines: calc.lines.map((l, k) => ({ ...l, idx: items[k].idx })), subtotal: calc.subtotal, taxTotal: calc.tax, total: calc.total, actorId: c.user.id } });
      const credited = inv.creditNotes.reduce((s, x) => s + Math.round(Number(x.total) * 100), 0) + Math.round(calc.total * 100), paid = inv.payments.reduce((s, x) => s + Math.round(Number(x.amount) * 100), 0), net = Math.round(Number(inv.total) * 100) - credited;
      await tx.order.update({ where: { id: inv.orderId }, data: { paymentStatus: net <= 0 ? "REFUNDED" : paid >= net ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID" } });
      await tx.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "credit_note.created", detail: { note: cn.number, invoice: inv.number, total: calc.total } } });
      return cn.id;
    });
  } catch (e: any) {
    if (e?.message === "NOINV") fail("/invoices", "Invoice not found");
    if (e?.message === "NOITEMS") fail(back, "Enter a quantity for at least one line");
    if (e?.message?.startsWith("BADQTY:")) fail(back, `${e.message.slice(7)}: the quantity is more than what's left to credit`);
    if (e?.code === "P2002") fail(back, "Another credit note was created at the same moment. Please try again"); throw e;
  }
  revalidatePath(back); revalidatePath("/invoices"); redirect(`/credit-notes/${cnId}`);
}

// ---- bills and vendor payments (accounts payable) -----------------------------------------
const PAYERS: Role[] = ["OWNER", "ACCOUNTANT"];
export async function addBill(fd: FormData) {
  const c = await guard(BUY, "/bills");
  if (!(await firstUse(c.orgId, fd.get("key"), "bill"))) redirect("/bills");
  const p = z.object({ supplierId: z.string().min(1), billNo: z.string().trim().max(40).optional(), amount: z.coerce.number().positive().max(100000000), billDate: z.string().optional(), dueOn: z.string().min(1), note: z.string().trim().max(200).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/bills", "Choose a supplier, enter the amount and a due date");
  const d = p.data!, due = new Date(d.dueOn), bd = d.billDate ? new Date(d.billDate) : new Date(); if (isNaN(due.getTime()) || isNaN(bd.getTime())) fail("/bills", "Enter valid dates");
  if (!(await db.supplier.findFirst({ where: { id: d.supplierId, orgId: c.orgId } }))) fail("/bills", "Supplier not found");
  await db.$transaction(async (tx) => {
    const last = await tx.bill.aggregate({ where: { orgId: c.orgId }, _max: { number: true } });
    await tx.bill.create({ data: { orgId: c.orgId, number: (last._max.number ?? 0) + 1, supplierId: d.supplierId, billNo: d.billNo || null, amount: Math.round(d.amount * 100) / 100, billDate: bd, dueOn: due, note: d.note || null } });
  });
  revalidatePath("/bills"); redirect("/bills");
}
/** Money paid to a supplier. Locks the bill row so two payments can't overpay it; a double-click is ignored. */
export async function payBill(fd: FormData) {
  const c = await guard(PAYERS, "/bills"), id = String(fd.get("billId"));
  const p = z.object({ amount: z.coerce.number().positive().max(100000000), method: z.enum(["CASH", "UPI", "BANK", "CARD", "CHEQUE"]), reference: z.string().trim().max(80).optional(), key: z.string().min(8) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/bills", "Enter an amount and choose a payment method");
  const d = p.data!; let err = "";
  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Bill" WHERE id=${id} AND "orgId"=${c.orgId} FOR UPDATE`;
      const b = await tx.bill.findFirst({ where: { id, orgId: c.orgId }, include: { payments: { select: { amount: true } } } }); if (!b) { err = "Bill not found"; return; }
      const paid = b.payments.reduce((s, x) => s + Math.round(Number(x.amount) * 100), 0), amt = Math.round(d.amount * 100);
      if (amt > Math.round(Number(b.amount) * 100) - paid) { err = "That is more than the balance due"; return; }
      await tx.billPayment.create({ data: { orgId: c.orgId, billId: id, amount: amt / 100, method: d.method, reference: d.reference || null, actorId: c.user.id, idempotencyKey: `bp:${d.key}` } });
    });
  } catch (e: any) { if (e.code !== "P2002") throw e; }
  if (err) fail("/bills", err);
  revalidatePath("/bills"); redirect(`/bills?ok=${encodeURIComponent("Payment recorded")}`);
}

// ---- price lists ---------------------------------------------------------------------------
export async function addPriceList(fd: FormData) {
  const c = await guard(["OWNER", "INVENTORY_MANAGER"], "/customers");
  const p = z.object({ name: z.string().trim().min(1).max(60), percent: z.coerce.number().min(-90).max(100) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/customers", "Give the list a name and a percentage between -90 and 100 (-10 means 10% off)");
  try { await db.priceList.create({ data: { orgId: c.orgId, name: p.data!.name, percent: Math.round(p.data!.percent * 100) / 100 } }); } catch (e: any) { if (e.code === "P2002") fail("/customers", "A price list with that name already exists"); throw e; }
  revalidatePath("/customers"); redirect("/customers");
}
export async function deletePriceList(fd: FormData) {
  const c = await guard(["OWNER", "INVENTORY_MANAGER"], "/customers"), id = String(fd.get("id"));
  await db.$transaction([db.customer.updateMany({ where: { orgId: c.orgId, priceListId: id }, data: { priceListId: null } }), db.priceList.deleteMany({ where: { id, orgId: c.orgId } })]);
  revalidatePath("/customers"); redirect("/customers");
}

// ---- warehouses and stock transfers --------------------------------------------------------
export async function addWarehouse(fd: FormData) {
  const c = await guard(STOCK, "/warehouses"), name = z.string().trim().min(1).max(60).safeParse(fd.get("name"));
  if (!name.success) fail("/warehouses", "Give the warehouse a name");
  const lim = await checkLimit(c.orgId, "locations", 1); if (lim) fail("/warehouses", lim);
  await db.warehouse.create({ data: { orgId: c.orgId, name: name.data! } });
  revalidatePath("/warehouses"); redirect("/warehouses");
}
export async function setDefaultWarehouse(fd: FormData) {
  const c = await guard(["OWNER"], "/warehouses"), id = String(fd.get("id"));
  if (!(await db.warehouse.findFirst({ where: { id, orgId: c.orgId } }))) fail("/warehouses", "Warehouse not found");
  await db.$transaction([db.warehouse.updateMany({ where: { orgId: c.orgId }, data: { isDefault: false } }), db.warehouse.update({ where: { id }, data: { isDefault: true } })]);
  revalidatePath("/warehouses"); redirect(`/warehouses?ok=${encodeURIComponent("Default warehouse changed. New orders and receipts use it.")}`);
}
/** Deletes an empty warehouse. Blocked for the default one, the last one, and any that still holds stock (sellable, reserved or damaged) or an open batch: transfer the stock out first.
 *  The append-only stock ledger and past transfers keep the id, so history stays intact. */
export async function deleteWarehouse(fd: FormData) {
  const c = await guard(STOCK, "/warehouses"), id = String(fd.get("id"));
  const w = await db.warehouse.findFirst({ where: { id, orgId: c.orgId } }); if (!w) fail("/warehouses", "Warehouse not found");
  if (w!.isDefault) fail("/warehouses", "This is the default warehouse. Make another one the default first, then delete it");
  if ((await db.warehouse.count({ where: { orgId: c.orgId } })) <= 1) fail("/warehouses", "You need at least one warehouse");
  const [held, batches] = await Promise.all([
    db.stockBalance.findFirst({ where: { orgId: c.orgId, warehouseId: id, OR: [{ sellable: { not: 0 } }, { reserved: { not: 0 } }, { damaged: { not: 0 } }] }, select: { id: true } }),
    db.batch.findFirst({ where: { orgId: c.orgId, warehouseId: id, qty: { gt: 0 } }, select: { id: true } })]);
  if (held || batches) fail("/warehouses", `${w!.name} still holds stock. Transfer it to another warehouse first, then delete`);
  await db.$transaction([db.stockBalance.deleteMany({ where: { orgId: c.orgId, warehouseId: id } }), db.batch.deleteMany({ where: { orgId: c.orgId, warehouseId: id, qty: 0 } }), db.warehouse.deleteMany({ where: { id, orgId: c.orgId } }),
    db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "warehouse.deleted" } })]);
  revalidatePath("/warehouses"); redirect(`/warehouses?ok=${encodeURIComponent(`${w!.name} deleted.`)}`);
}
/** Transfer order: moves sellable stock from one warehouse to another in one transaction. Reserved units can't be moved (the source must still cover its reservations). Each move writes TRANSFER_OUT and TRANSFER_IN ledger rows; the key makes a double-click harmless. */
export async function transferStock(fd: FormData) {
  const c = await guard(STOCK, "/warehouses");
  const p = z.object({ productId: z.string().min(1), fromId: z.string().min(1), toId: z.string().min(1), qty: z.coerce.number().int().min(1).max(10_000_000), note: z.string().trim().max(200).optional(), key: z.string().min(8) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/warehouses", "Choose a product, two different warehouses and a whole-number quantity");
  const d = p.data!; if (d.fromId === d.toId) fail("/warehouses", "Choose two different warehouses");
  let err = "";
  try {
    await db.$transaction(async (tx) => {
      if (await tx.stockMovement.findUnique({ where: { idempotencyKey: `trf:${d.key}:out` } })) return; // already done
      const [prod, ws] = await Promise.all([tx.product.findFirst({ where: { id: d.productId, orgId: c.orgId } }), tx.warehouse.findMany({ where: { orgId: c.orgId, id: { in: [d.fromId, d.toId] } } })]);
      if (!prod || ws.length !== 2) { err = "Product or warehouse not found"; return; }
      const moved = await tx.$executeRaw`UPDATE "StockBalance" SET sellable = sellable - ${d.qty} WHERE "orgId"=${c.orgId} AND "productId"=${d.productId} AND "warehouseId"=${d.fromId} AND sellable - reserved >= ${d.qty}`;
      if (moved !== 1) { err = "Not enough available stock in the source warehouse (reserved units can't be moved)"; return; }
      await tx.stockBalance.upsert({ where: { productId_warehouseId: { productId: d.productId, warehouseId: d.toId } }, create: { orgId: c.orgId, productId: d.productId, warehouseId: d.toId, sellable: d.qty }, update: { sellable: { increment: d.qty } } });
      if (prod.tracking === "BATCH") { // batch records follow the stock: earliest expiry moves first
        let left = d.qty; const src = await tx.batch.findMany({ where: { orgId: c.orgId, productId: d.productId, warehouseId: d.fromId, qty: { gt: 0 } }, orderBy: [{ expiresOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] });
        for (const b of src) { if (left <= 0) break; const take = Math.min(b.qty, left);
          if ((await tx.$executeRaw`UPDATE "Batch" SET qty = qty - ${take} WHERE id=${b.id} AND qty >= ${take}`) === 1) {
            await tx.batch.upsert({ where: { orgId_productId_warehouseId_code: { orgId: c.orgId, productId: d.productId, warehouseId: d.toId, code: b.code } }, update: { qty: { increment: take }, received: { increment: take } }, create: { orgId: c.orgId, productId: d.productId, warehouseId: d.toId, code: b.code, expiresOn: b.expiresOn, qty: take, received: take } }); left -= take; } } }
      const last = await tx.stockTransfer.aggregate({ where: { orgId: c.orgId }, _max: { number: true } });
      const t = await tx.stockTransfer.create({ data: { orgId: c.orgId, number: (last._max.number ?? 0) + 1, productId: d.productId, fromId: d.fromId, toId: d.toId, qty: d.qty, note: d.note || null, actorId: c.user.id } });
      await tx.stockMovement.createMany({ data: [{ orgId: c.orgId, productId: d.productId, warehouseId: d.fromId, type: "TRANSFER_OUT", qty: -d.qty, sourceRef: t.id, actorId: c.user.id, idempotencyKey: `trf:${d.key}:out` },
        { orgId: c.orgId, productId: d.productId, warehouseId: d.toId, type: "TRANSFER_IN", qty: d.qty, sourceRef: t.id, actorId: c.user.id, idempotencyKey: `trf:${d.key}:in` }] });
    });
  } catch (e: any) { if (e.code === "P2002") { if (!(await db.stockMovement.findUnique({ where: { idempotencyKey: `trf:${d.key}:out` } }))) err = "Another transfer was saved at the same moment. Please try again"; } else throw e; }
  if (err) fail("/warehouses", err);
  await notifyLow(c.orgId, [d.productId]);
  revalidatePath("/warehouses"); revalidatePath("/inventory"); redirect(`/warehouses?ok=${encodeURIComponent("Stock transferred")}`);
}

// ---- shipping and payment reminders ----------------------------------------------------------
const CARRIERS = ["Delhivery", "Blue Dart", "DTDC", "India Post", "Xpressbees", "Ecom Express", "Shadowfax", "Own delivery", "Other"];
export async function setShipping(fd: FormData) {
  const id = String(fd.get("orderId")), back = `/orders/${id}`, c = await guard(SALES, back);
  const p = z.object({ carrier: z.enum(CARRIERS as [string, ...string[]]), trackingNo: z.string().trim().max(60).optional(), trackingUrl: z.string().trim().max(300).refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), "link").optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail(back, "Choose a carrier, keep the tracking number under 60 characters, and make the tracking link start with http:// or https://");
  const d = p.data!, o = await db.order.findFirst({ where: { id, orgId: c.orgId }, include: { customerRec: true } }); if (!o) fail("/orders", "Order not found");
  if (!["CONFIRMED", "DISPATCHED", "DELIVERED"].includes(o!.status)) fail(back, "Confirm the order before adding shipping details");
  await db.order.update({ where: { id }, data: { carrier: d.carrier, trackingNo: d.trackingNo || null, trackingUrl: d.trackingUrl || null, shippedAt: o!.shippedAt ?? new Date() } });
  await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "order.shipping_set", detail: { order: o!.number, carrier: d.carrier, trackingNo: d.trackingNo || null } } });
  let msg = "Shipping details saved";
  if (fd.get("notify") === "1" && o!.customerRec?.email) {
    await throttle(back, `ship:${c.user.id}`, 30, 3600_000);
    const org = await db.organization.findUnique({ where: { id: c.orgId } });
    await sendMail({ to: o!.customerRec.email, subject: `Your order #${o!.number} from ${org?.name ?? "us"} is on its way`, html: `<p>Hello ${esc(o!.customer)},</p><p>Your order <b>#${o!.number}</b> has been shipped with <b>${esc(d.carrier)}</b>${d.trackingNo ? `. Tracking number: <b>${esc(d.trackingNo)}</b>` : ""}.</p>${d.trackingUrl ? `<p><a href="${esc(d.trackingUrl)}">Track your parcel</a></p>` : ""}<p>Thank you,<br/>${esc(org?.name ?? "")}</p>` });
    msg = "Shipping details saved and the customer was emailed";
  }
  revalidatePath(back); redirect(`${back}?ok=${encodeURIComponent(msg)}`);
}
/** Friendly payment reminder to the customer's email. Rate-limited so it can't be used to spam. */
export async function sendInvoiceReminder(fd: FormData) {
  const id = String(fd.get("invoiceId")), back = `/invoices/${id}`, c = await guard([...SALES, "ACCOUNTANT"], back);
  const inv = await db.invoice.findFirst({ where: { id, orgId: c.orgId }, include: { payments: { select: { amount: true } }, creditNotes: { select: { total: true } }, order: { include: { customerRec: true } } } }); if (!inv) fail("/invoices", "Invoice not found");
  const email = inv!.order.customerRec?.email; if (!email) fail(back, "This customer has no email address. Add one on the Customers page");
  const left = Math.round(Number(inv!.total) * 100) - inv!.payments.reduce((t, x) => t + Math.round(Number(x.amount) * 100), 0) - inv!.creditNotes.reduce((t, x) => t + Math.round(Number(x.total) * 100), 0);
  if (left <= 0) fail(back, "Nothing is due on this invoice");
  await throttle(back, `rem:${c.user.id}`, 20, 3600_000);
  const org = await db.organization.findUnique({ where: { id: c.orgId } }), due = inv!.dueOn.toLocaleDateString("en-IN"), late = inv!.dueOn < new Date();
  await sendMail({ to: email!, subject: `${late ? "Overdue" : "Payment reminder"}: invoice ${invNo(inv!.number)} from ${org?.name ?? "us"}`, html: `<p>Hello ${esc(inv!.customerName)},</p><p>This is a ${late ? "reminder that" : "friendly note that"} invoice <b>${invNo(inv!.number)}</b> has a balance of <b>₹${(left / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</b>, due on ${due}${late ? " (now overdue)" : ""}.</p><p>If you have already paid, please ignore this message.</p><p>Thank you,<br/>${esc(org?.name ?? "")}</p>` });
  await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "invoice.reminder_sent", detail: { invoice: inv!.number } } });
  redirect(`${back}?ok=${encodeURIComponent("Reminder emailed to the customer")}`);
}

// ---- item groups (variants) and kits (bundles) ------------------------------------------------
const TAXR = z.coerce.number().refine((v) => GST_RATES.includes(v));
/** One product idea -> one real product per size/colour. Each variant is an ordinary product (own SKU, stock, price), tied together by groupName. */
export async function createVariants(fd: FormData) {
  const c = await guard(STOCK, "/products/variants");
  const p = z.object({ name: z.string().trim().min(1).max(100), baseSku: z.string().trim().min(1).max(30), price: z.coerce.number().min(0), cost: z.coerce.number().min(0), taxRate: TAXR, hsn: z.string().trim().max(10).optional(), reorder: z.coerce.number().int().min(0).default(0), opening: z.coerce.number().int().min(0).max(1_000_000).default(0), sizes: z.string().max(1000).default(""), colours: z.string().max(1000).default("") }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/products/variants", `Check the ${String(p.error.issues[0].path[0])} field`);
  const d = p.data!, combos = variantCombos(d.baseSku, [parseOptions(d.sizes), parseOptions(d.colours)]);
  if (!combos) fail("/products/variants", "Enter sizes and/or colours (up to 60 combinations, and each must give a different SKU)");
  const w = await wh(c.orgId), lim = await checkLimit(c.orgId, "products", combos!.length); if (lim) fail("/products/variants", lim);
  try {
    await db.$transaction(async (tx) => { for (const v of combos!) {
      const pr = await tx.product.create({ data: { orgId: c.orgId, sku: v.sku, name: `${d.name} - ${v.label}`, hsn: d.hsn || null, price: d.price, unitCost: d.cost, reorderAt: d.reorder, taxRate: d.taxRate, groupName: d.name, variantLabel: v.label } });
      await tx.stockBalance.create({ data: { orgId: c.orgId, productId: pr.id, warehouseId: w.id, sellable: d.opening } });
      if (d.opening > 0) await tx.stockMovement.create({ data: { orgId: c.orgId, productId: pr.id, warehouseId: w.id, type: "OPENING", qty: d.opening, actorId: c.user.id, idempotencyKey: `open:${pr.id}` } }); } });
  } catch (e: any) { if (e.code === "P2002") fail("/products/variants", "One of those SKUs already exists. Nothing was created. Change the base SKU or the options"); throw e; }
  revalidatePath("/products"); redirect(`/products?q=${encodeURIComponent(d.baseSku)}`);
}
/** A kit is sold as one line (own price and GST) but reserves and deducts its components. Components are fixed: archive the kit and make a new one to change them. */
export async function createKit(fd: FormData) {
  const c = await guard(STOCK, "/kits");
  const p = z.object({ sku: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(100), price: z.coerce.number().min(0), taxRate: TAXR, hsn: z.string().trim().max(10).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/kits", `Check the ${String(p.error.issues[0].path[0])} field`);
  const parts = new Map<string, number>();
  for (let i = 1; i <= 6; i++) { const id = String(fd.get(`cp${i}`) ?? ""), q = Number(fd.get(`cq${i}`)); if (!id) continue;
    if (!Number.isInteger(q) || q < 1 || q > 10000) fail("/kits", `Component ${i}: quantity must be a whole number from 1 to 10000`); if (parts.has(id)) fail("/kits", "Each component can be listed once. Add up the quantity instead"); parts.set(id, q); }
  if (!parts.size) fail("/kits", "Add at least one component");
  const comps = await db.product.findMany({ where: { id: { in: [...parts.keys()] }, orgId: c.orgId, archived: false } });
  if (comps.length !== parts.size) fail("/kits", "One of the components wasn't found");
  if (comps.some((x) => x.isKit)) fail("/kits", "A kit can't contain another kit"); if (comps.some((x) => x.tracking === "SERIAL")) fail("/kits", "Serial-tracked products can't go inside a kit. Sell them on their own");
  const lim = await checkLimit(c.orgId, "products", 1); if (lim) fail("/kits", lim);
  const cost = Math.round(comps.reduce((t, x) => t + Number(x.unitCost) * 100 * parts.get(x.id)!, 0)) / 100;
  try {
    await db.$transaction(async (tx) => {
      const kit = await tx.product.create({ data: { orgId: c.orgId, sku: p.data!.sku, name: p.data!.name, hsn: p.data!.hsn || null, price: p.data!.price, unitCost: cost, taxRate: p.data!.taxRate, isKit: true } });
      await tx.kitComponent.createMany({ data: [...parts].map(([componentId, qty]) => ({ orgId: c.orgId, kitId: kit.id, componentId, qty })) });
    });
  } catch (e: any) { if (e.code === "P2002") fail("/kits", "That SKU already exists in your catalog"); throw e; }
  revalidatePath("/kits"); revalidatePath("/products"); redirect("/kits");
}

// ---- batch and serial tracking -----------------------------------------------------------------
/** Assigns stock that is already on the shelf (and not yet in any batch) to a batch. Used when you start tracking an existing product. */
export async function registerBatch(fd: FormData) {
  const c = await guard(STOCK, "/traceability");
  const p = z.object({ productId: z.string(), warehouseId: z.string(), code: z.string().trim().min(1).max(40), expiresOn: z.string().optional(), qty: z.coerce.number().int().min(1).max(10_000_000) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/traceability", "Choose a product, enter a batch number and a whole quantity");
  const d = p.data!, exp = d.expiresOn ? new Date(`${d.expiresOn}T00:00:00Z`) : null; if (exp && isNaN(exp.getTime())) fail("/traceability", "Enter a valid expiry date");
  let err = "";
  await db.$transaction(async (tx) => {
    const pr = await tx.product.findFirst({ where: { id: d.productId, orgId: c.orgId } }); if (!pr || pr.tracking !== "BATCH") { err = "Switch this product to batch tracking first (product page)"; return; }
    const rows = await tx.$queryRaw<{ id: string; sellable: number }[]>`SELECT id, sellable FROM "StockBalance" WHERE "orgId"=${c.orgId} AND "productId"=${d.productId} AND "warehouseId"=${d.warehouseId} FOR UPDATE`;
    if (!rows[0]) { err = "No stock of that product in that warehouse"; return; }
    const used = await tx.batch.aggregate({ where: { orgId: c.orgId, productId: d.productId, warehouseId: d.warehouseId }, _sum: { qty: true } });
    if (d.qty > rows[0].sellable - (used._sum.qty ?? 0)) { err = `Only ${Math.max(0, rows[0].sellable - (used._sum.qty ?? 0))} unit(s) there aren't in a batch yet`; return; }
    await tx.batch.upsert({ where: { orgId_productId_warehouseId_code: { orgId: c.orgId, productId: d.productId, warehouseId: d.warehouseId, code: d.code } }, update: { qty: { increment: d.qty }, received: { increment: d.qty }, ...(exp ? { expiresOn: exp } : {}) }, create: { orgId: c.orgId, productId: d.productId, warehouseId: d.warehouseId, code: d.code, expiresOn: exp, qty: d.qty, received: d.qty } });
  });
  if (err) fail("/traceability", err); revalidatePath("/traceability"); redirect(`/traceability?ok=${encodeURIComponent("Batch saved")}`);
}
/** Registers serial numbers for units already in stock (no stock movement: the units are already counted). */
export async function registerSerials(fd: FormData) {
  const c = await guard(STOCK, "/traceability?t=serials"), back = "/traceability?t=serials";
  const pid = String(fd.get("productId")), ps = parseSerials(String(fd.get("serials") ?? "").slice(0, 50000));
  if (ps.bad.length || ps.dups.length) fail(back, `Serial numbers can use letters, digits and . _ / - only, once each. Check: ${[...ps.bad, ...ps.dups].slice(0, 3).join(", ")}`);
  if (!ps.list.length || ps.list.length > 2000) fail(back, "Enter between 1 and 2000 serial numbers");
  let err = "";
  await db.$transaction(async (tx) => {
    const pr = await tx.product.findFirst({ where: { id: pid, orgId: c.orgId } }); if (!pr || pr.tracking !== "SERIAL") { err = "Switch this product to serial tracking first (product page)"; return; }
    const [bal, have, clash] = await Promise.all([tx.stockBalance.aggregate({ where: { orgId: c.orgId, productId: pid }, _sum: { sellable: true } }), tx.serialNumber.count({ where: { orgId: c.orgId, productId: pid, status: { in: ["IN_STOCK", "ASSIGNED"] } } }), tx.serialNumber.findFirst({ where: { orgId: c.orgId, productId: pid, serial: { in: ps.list } } })]);
    if (clash) { err = `Serial number ${clash.serial} already exists`; return; }
    if (have + ps.list.length > (bal._sum.sellable ?? 0)) { err = `That would be more serial numbers than units in stock (${bal._sum.sellable ?? 0}, ${have} already registered)`; return; }
    await tx.serialNumber.createMany({ data: ps.list.map((serial) => ({ orgId: c.orgId, productId: pid, serial })) });
  });
  if (err) fail(back, err); revalidatePath("/traceability"); redirect(`${back}&ok=${encodeURIComponent(`${ps.list.length} serial number(s) registered`)}`);
}
/** A sold unit came back and is good: make its serial number available again. (Put the unit itself back on the shelf through Returns.) */
export async function restockSerial(fd: FormData) {
  const c = await guard(STOCK, "/traceability?t=serials"), id = String(fd.get("id"));
  const r = await db.serialNumber.updateMany({ where: { id, orgId: c.orgId, status: "SOLD" }, data: { status: "IN_STOCK", orderId: null, orderLineId: null, soldAt: null } });
  if (r.count) await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "serial.restocked", detail: { serial: id } } });
  revalidatePath("/traceability"); redirect(`/traceability?t=serials&ok=${encodeURIComponent(r.count ? "Serial number is back in stock" : "Nothing to change")}`);
}
/** Picks which serial numbers go out on an order line. They are held for the order until it is dispatched (sold) or cancelled (released). */
export async function assignSerials(fd: FormData) {
  const oid = String(fd.get("orderId")), lid = String(fd.get("lineId")), back = `/orders/${oid}`, c = await guard(SALES, back);
  const ps = parseSerials(String(fd.get("serials") ?? "").slice(0, 20000));
  if (ps.bad.length || ps.dups.length) fail(back, `Check these serial numbers: ${[...ps.bad, ...ps.dups].slice(0, 3).join(", ")}`);
  let err = "";
  await db.$transaction(async (tx) => {
    const o = await tx.order.findFirst({ where: { id: oid, orgId: c.orgId, status: "CONFIRMED" }, include: { lines: { where: { id: lid }, include: { product: true } } } });
    const l = o?.lines[0]; if (!o || !l) { err = "Confirm the order first (serial numbers can only be set on confirmed orders)"; return; }
    if (l.product.tracking !== "SERIAL") { err = "That product isn't serial tracked"; return; }
    if (ps.list.length !== l.qty) { err = `Enter exactly ${l.qty} serial number(s) for ${l.product.name} (you entered ${ps.list.length})`; return; }
    await tx.serialNumber.updateMany({ where: { orgId: c.orgId, orderLineId: lid, status: "ASSIGNED" }, data: { status: "IN_STOCK", orderId: null, orderLineId: null } }); // replace any earlier choice
    const n = await tx.serialNumber.updateMany({ where: { orgId: c.orgId, productId: l.productId, serial: { in: ps.list }, status: "IN_STOCK" }, data: { status: "ASSIGNED", orderId: oid, orderLineId: lid } });
    if (n.count !== ps.list.length) throw new Error("SERIALS");
  }).catch((e: any) => { if (e.message === "SERIALS") err = "Some of those serial numbers aren't in stock for this product (unknown, already sold, or held by another order)"; else throw e; });
  if (err) fail(back, err); revalidatePath(back); redirect(`${back}?ok=${encodeURIComponent("Serial numbers assigned")}`);
}

/** Stores the 12-digit e-way bill number the GST portal gave back, so it prints with the invoice. */
export async function saveEwayNo(fd: FormData) {
  const id = String(fd.get("invoiceId")), back = `/invoices/${id}`, c = await guard([...SALES, "ACCOUNTANT"], back), no = String(fd.get("no") ?? "").trim();
  if (no && !/^[0-9]{12}$/.test(no)) fail(back, "An e-way bill number has exactly 12 digits");
  const r = await db.invoice.updateMany({ where: { id, orgId: c.orgId }, data: { ewayBillNo: no || null } }); if (!r.count) fail("/invoices", "Invoice not found");
  revalidatePath(back); redirect(`${back}?ok=${encodeURIComponent(no ? "E-way bill number saved" : "E-way bill number cleared")}`);
}

// ---- public contact form -----------------------------------------------------------------------
/** Public form: honeypot, rate limit (+ Turnstile when configured), then store the message and email it to the business's contact address. The message is saved even if email fails. */
export async function submitContact(fd: FormData) {
  const back = "/contact";
  if (String(fd.get("website") ?? "").trim()) redirect("/contact?sent=1"); // hidden field: only bots fill it. Look successful, store nothing
  await gate(back, fd, "contact", 3);
  const p = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email().max(200), phone: z.string().trim().max(20).regex(/^[0-9+()\-\s]*$/).optional(), message: z.string().trim().min(10).max(2000) }).safeParse(Object.fromEntries(fd));
  if (!p.success) { const f = String(p.error.issues[0].path[0]); fail(back, f === "message" ? "Please write a message of at least 10 characters (2000 at most)" : f === "email" ? "Please enter a valid email address" : f === "phone" ? "Phone can contain digits, spaces, + ( ) and - only" : "Please enter your name"); }
  const d = p.data!, row = await db.contactMessage.create({ data: { name: d.name, email: d.email, phone: d.phone || null, message: d.message } });
  const to = process.env.CONTACT_TO || process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  if (to) { const r = await sendMail({ to, replyTo: d.email, subject: `Contact form: ${d.name}`, html: `<p><b>${esc(d.name)}</b> (${esc(d.email)}${d.phone ? `, ${esc(d.phone)}` : ""}) wrote:</p><p style="white-space:pre-wrap">${esc(d.message)}</p>` }); if (r.ok) await db.contactMessage.update({ where: { id: row.id }, data: { emailed: true } }); }
  redirect("/contact?sent=1");
}

// ---- webhooks, automation rules, API keys, couriers, Shopify, low-stock alert settings ------
const hooked = (m: string) => redirect(`/webhooks?ok=${encodeURIComponent(m)}`);
export async function createWebhook(fd: FormData) {
  const c = await guard(["OWNER"], "/webhooks"), url = String(fd.get("url") ?? "").trim(), evs = fd.getAll("events").map(String).filter((e) => EVENT_KEYS.includes(e));
  if (!evs.length) fail("/webhooks", "Choose at least one event");
  if ((await db.webhook.count({ where: { orgId: c.orgId } })) >= 10) fail("/webhooks", "You can add up to 10 webhooks");
  let bad = ""; try { await resolveSafe(url); } catch (e: any) { bad = e.message; }
  if (bad) fail("/webhooks", bad);
  await db.$transaction([db.webhook.create({ data: { orgId: c.orgId, url, events: evs, secret: newSecret() } }), db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "webhook.created", detail: { host: new URL(url).host, events: evs } } })]);
  revalidatePath("/webhooks"); hooked("Webhook added. Open its secret below to verify signatures.");
}
const ownHook = async (fd: FormData) => { const c = await guard(["OWNER"], "/webhooks"), h = await db.webhook.findFirst({ where: { id: String(fd.get("id")), orgId: c.orgId } }); if (!h) fail("/webhooks", "Webhook not found"); return { c, h: h! }; };
export async function toggleWebhook(fd: FormData) { const { h } = await ownHook(fd); await db.webhook.update({ where: { id: h.id }, data: { active: !h.active, failures: 0 } }); revalidatePath("/webhooks"); hooked(h.active ? "Webhook switched off" : "Webhook switched on"); }
export async function deleteWebhook(fd: FormData) { const { c, h } = await ownHook(fd); await db.$transaction([db.webhook.delete({ where: { id: h.id } }), db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "webhook.deleted", detail: { host: new URL(h.url).host } } })]); revalidatePath("/webhooks"); hooked("Webhook deleted"); }
export async function rotateWebhookSecret(fd: FormData) { const { h } = await ownHook(fd); await db.webhook.update({ where: { id: h.id }, data: { secret: newSecret() } }); revalidatePath("/webhooks"); hooked("New secret created. Update your receiver now: the old one no longer works."); }
export async function testWebhook(fd: FormData) {
  const { c, h } = await ownHook(fd), d = await db.webhookDelivery.create({ data: { orgId: c.orgId, webhookId: h.id, event: "webhook.test", payload: { id: crypto.randomUUID(), event: "webhook.test", createdAt: new Date().toISOString(), data: { message: "Test from Direct2Hub" } } } });
  await deliver(d.id); const r = await db.webhookDelivery.findUnique({ where: { id: d.id } }); revalidatePath("/webhooks");
  if (r?.status === "SUCCESS") hooked(`Test delivered (HTTP ${r.responseCode})`); fail("/webhooks", `Test failed: ${r?.error ?? "unknown error"}`);
}
export async function resendDelivery(fd: FormData) {
  const c = await guard(["OWNER"], "/webhooks"), d = await db.webhookDelivery.findFirst({ where: { id: String(fd.get("id")), orgId: c.orgId } }); if (!d) fail("/webhooks", "Delivery not found");
  await db.webhookDelivery.update({ where: { id: d!.id }, data: { status: "PENDING", attempts: 0, nextAttemptAt: null, error: null } }); await deliver(d!.id); revalidatePath("/webhooks"); hooked("Delivery retried");
}

export async function createAutomation(fd: FormData) {
  const c = await guard(["OWNER"], "/automations");
  const p = z.object({ name: z.string().trim().min(1).max(80), event: z.enum(EVENT_KEYS as [string, ...string[]]), field: z.string().trim().regex(/^\w{1,40}$/).optional().or(z.literal("")), op: z.enum(OPS.map((o) => o[0]) as [string, ...string[]]).optional().or(z.literal("")),
    value: z.string().trim().max(80).optional(), action: z.enum(["NOTIFY", "EMAIL"]), target: z.string().trim().email().optional().or(z.literal("")), template: z.string().trim().min(1).max(500) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/automations", "Check the name, the message and (for email) the address");
  const d = p.data!; if (d.field && !d.op) fail("/automations", "Choose how to compare the field"); if (d.action === "EMAIL" && !d.target) fail("/automations", "Enter the email address to notify");
  if ((await db.automation.count({ where: { orgId: c.orgId } })) >= 20) fail("/automations", "You can have up to 20 rules");
  await db.automation.create({ data: { orgId: c.orgId, name: d.name, event: d.event, field: d.field || null, op: d.op || null, value: d.value || null, action: d.action, target: d.target || null, template: d.template } });
  revalidatePath("/automations"); redirect(`/automations?ok=${encodeURIComponent("Rule added")}`);
}
export async function toggleAutomation(fd: FormData) { const c = await guard(["OWNER"], "/automations"), r = await db.automation.findFirst({ where: { id: String(fd.get("id")), orgId: c.orgId } }); if (r) await db.automation.update({ where: { id: r.id }, data: { active: !r.active } }); revalidatePath("/automations"); redirect("/automations"); }
export async function deleteAutomation(fd: FormData) { const c = await guard(["OWNER"], "/automations"); await db.automation.deleteMany({ where: { id: String(fd.get("id")), orgId: c.orgId } }); revalidatePath("/automations"); redirect("/automations"); }

export async function createApiKey(_: { key?: string; error?: string }, fd: FormData): Promise<{ key?: string; error?: string }> {
  const c = await guard(["OWNER"], "/integrations"), name = String(fd.get("name") ?? "").trim().slice(0, 60); if (!name) return { error: "Give the key a name" };
  if ((await db.apiKey.count({ where: { orgId: c.orgId, revokedAt: null } })) >= 5) return { error: "You can have up to 5 active keys. Revoke one first" };
  const k = newKey(); await db.$transaction([db.apiKey.create({ data: { orgId: c.orgId, name, prefix: k.prefix, hash: k.hash } }), db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "apikey.created", detail: { name } } })]);
  revalidatePath("/integrations"); return { key: k.key };
}
export async function revokeApiKey(fd: FormData) {
  const c = await guard(["OWNER"], "/integrations"), r = await db.apiKey.updateMany({ where: { id: String(fd.get("id")), orgId: c.orgId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count) await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "apikey.revoked" } }); revalidatePath("/integrations"); redirect("/integrations");
}
export async function addCarrier(fd: FormData) {
  const c = await guard(["OWNER"], "/integrations");
  const p = z.object({ name: z.string().trim().min(1).max(40), trackUrl: z.string().trim().max(300).regex(/^https:\/\/[^\s]+$/).refine((u) => u.includes("{awb}")) }).safeParse(Object.fromEntries(fd)); if (!p.success) fail("/integrations", "Enter a courier name and an https:// tracking URL containing {awb}");
  await db.carrier.upsert({ where: { orgId_name: { orgId: c.orgId, name: p.data!.name } }, update: { trackUrl: p.data!.trackUrl }, create: { orgId: c.orgId, ...p.data! } }); revalidatePath("/integrations"); redirect("/integrations");
}
export async function deleteCarrier(fd: FormData) { const c = await guard(["OWNER"], "/integrations"); await db.carrier.deleteMany({ where: { id: String(fd.get("id")), orgId: c.orgId } }); revalidatePath("/integrations"); redirect("/integrations"); }
const NEEDKEY = "Set APP_ENC_KEY on the server first (openssl rand -base64 32) so credentials can be stored encrypted";
export async function saveShopify(fd: FormData) {
  const c = await guard(["OWNER"], "/integrations"); if (!encryptionReady()) fail("/integrations", NEEDKEY);
  const shop = String(fd.get("shop") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""), token = String(fd.get("token") ?? "").trim();
  if (!validShop(shop) || token.length < 10) fail("/integrations", "Enter your store address (mystore.myshopify.com) and the Admin API access token");
  let bad = ""; try { await pingShopify(shop, token); } catch (e: any) { bad = e.message; } if (bad) fail("/integrations", bad);
  await db.connection.upsert({ where: { orgId_provider: { orgId: c.orgId, provider: "SHOPIFY" } }, update: { config: { shop }, secretEnc: encrypt(token), lastError: null }, create: { orgId: c.orgId, provider: "SHOPIFY", config: { shop }, secretEnc: encrypt(token) } });
  await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "connection.saved", detail: { provider: "SHOPIFY", shop } } }); revalidatePath("/integrations"); redirect("/integrations");
}
export async function deleteConnection(fd: FormData) { const c = await guard(["OWNER"], "/integrations"), prov = String(fd.get("provider")); await db.connection.deleteMany({ where: { orgId: c.orgId, provider: prov } }); await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "connection.removed", detail: { provider: prov } } }); revalidatePath("/integrations"); redirect("/integrations"); }
export async function syncShopifyNow() {
  const c = await guard(["OWNER"], "/integrations"), r = await syncShopify(c.orgId); revalidatePath("/orders"); revalidatePath("/integrations");
  if (r.error) fail("/integrations", `Shopify sync: ${r.error}${r.created ? ` (imported ${r.created} first)` : ""}`); redirect(`/orders?ok=${encodeURIComponent(`Imported ${r.created} Shopify order(s) as drafts. ${r.skipped} skipped because a SKU didn't match or the currency isn't rupees.`)}`);
}
export async function setLowStockAlerts(fd: FormData) {
  const c = await guard(["OWNER"], "/settings"), email = z.string().trim().email().optional().or(z.literal("")).safeParse(fd.get("alertEmail")); if (!email.success) fail("/settings", "Enter a valid email address");
  await db.organization.update({ where: { id: c.orgId }, data: { lowStockEmails: fd.get("lowStockEmails") === "on", alertEmail: email.data || null } }); revalidatePath("/settings"); done("Low-stock alert settings saved.");
}
export async function markDelivered(fd: FormData) {
  const id = String(fd.get("orderId")), back = `/orders/${id}`, c = await guard(SALES, back);
  const r = await db.order.updateMany({ where: { id, orgId: c.orgId, status: "DISPATCHED" }, data: { status: "DELIVERED", deliveredAt: new Date() } });
  if (!r.count) fail(back, "Only dispatched orders can be marked delivered");
  revalidatePath(back); revalidatePath("/orders"); redirect(back);
}
export async function setBackorders(fd: FormData) {
  const c = await guard(["OWNER"], "/settings"), on = fd.get("backorders") === "on";
  await db.$transaction([db.organization.update({ where: { id: c.orgId }, data: { backorders: on } }), db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: on ? "backorders.on" : "backorders.off" } })]);
  revalidatePath("/settings"); done(on ? "Backorders are on. An order without enough stock can be confirmed and waits for stock." : "Backorders are off. Orders need full stock to be confirmed. Orders already waiting stay in the queue.");
}
export async function retryBackorder(fd: FormData) {
  const id = String(fd.get("id")), c = await guard(SALES, `/orders/${id}`), ok = await tryReserve(c.orgId, (await wh(c.orgId)).id, c.user.id, id);
  revalidatePath(`/orders/${id}`); redirect(ok ? `/orders/${id}?ok=${encodeURIComponent("Stock reserved. The order can be dispatched now.")}` : `/orders/${id}?e=${encodeURIComponent("Still not enough stock for every line.")}`);
}

// ---- assembled products (bundles with their own stock) ------------------------------------
const BUNDLE_BACK = "/assembly";
/** Defines what a finished product is made of. Only plain products can be parts or finished goods: batch/serial-tracked items and kits would need a more detailed assembly and are not supported. */
export async function defineBundle(fd: FormData) {
  const c = await guard(STOCK, BUNDLE_BACK), bundleId = String(fd.get("bundleId") ?? ""), comps = new Map<string, number>();
  for (let i = 1; i <= 5; i++) { const id = String(fd.get(`c${i}`) ?? ""), q = Number(fd.get(`q${i}`)); if (!id) continue;
    if (!Number.isInteger(q) || q < 1 || q > 100000) fail(BUNDLE_BACK, `Row ${i}: quantity must be a whole number, 1 or more`); if (id === bundleId) fail(BUNDLE_BACK, "A product can't be made from itself"); comps.set(id, (comps.get(id) ?? 0) + q); }
  if (!comps.size) fail(BUNDLE_BACK, "Add at least one component");
  const prods = await db.product.findMany({ where: { orgId: c.orgId, archived: false, id: { in: [bundleId, ...comps.keys()] } } }); if (prods.length !== comps.size + 1) fail(BUNDLE_BACK, "Product not found");
  const bad = prods.find((p) => p.isKit || p.tracking !== "NONE"); if (bad) fail(BUNDLE_BACK, `${bad.name} is a kit or is tracked by batch or serial number. Only plain products can be assembled.`);
  const inUse = await db.bundleComponent.findFirst({ where: { orgId: c.orgId, componentId: bundleId } }); if (inUse) fail(BUNDLE_BACK, "This product is already a part of another assembled product. Keep assembly to one level.");
  const asPart = await db.bundleComponent.findFirst({ where: { orgId: c.orgId, bundleId: { in: [...comps.keys()] } } }); if (asPart) fail(BUNDLE_BACK, "A part can't itself be an assembled product. Keep assembly to one level.");
  const cost = Math.round([...comps].reduce((s, [id, q]) => s + Number(prods.find((x) => x.id === id)!.unitCost) * q, 0) * 100) / 100;
  await db.$transaction([db.bundleComponent.deleteMany({ where: { orgId: c.orgId, bundleId } }), db.bundleComponent.createMany({ data: [...comps].map(([componentId, qty]) => ({ orgId: c.orgId, bundleId, componentId, qty })) }), db.product.update({ where: { id: bundleId }, data: { unitCost: cost } }),
    db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "assembly.defined", detail: { bundleId, parts: comps.size } } })]);
  revalidatePath(BUNDLE_BACK); redirect(`${BUNDLE_BACK}?ok=${encodeURIComponent("Saved. The unit cost is now the cost of the parts.")}`);
}
/** Builds finished units: parts leave stock, finished units enter stock, in ONE transaction. Only available (unreserved) stock of the parts can be used. Retry-safe through the form key. */
export async function assembleBundle(fd: FormData) {
  const c = await guard(STOCK, BUNDLE_BACK);
  const p = z.object({ bundleId: z.string(), qty: z.coerce.number().int().positive().max(100000), key: z.string().min(8).max(80) }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail(BUNDLE_BACK, "Choose a product and a whole quantity");
  const d = p.data!, w = await wh(c.orgId);
  try {
    await db.$transaction(async (tx) => {
      const comps = await tx.bundleComponent.findMany({ where: { orgId: c.orgId, bundleId: d.bundleId } }); if (!comps.length) throw new Error("NOBUNDLE");
      for (const k of [...comps].sort((a, b) => a.componentId.localeCompare(b.componentId))) { const need = k.qty * d.qty;
        const n = await tx.$executeRaw`UPDATE "StockBalance" SET sellable = sellable - ${need} WHERE "orgId"=${c.orgId} AND "productId"=${k.componentId} AND "warehouseId"=${w.id} AND sellable - reserved >= ${need}`;
        if (n === 0) throw new Error("SHORT:" + k.componentId);
        await tx.stockMovement.create({ data: { orgId: c.orgId, productId: k.componentId, warehouseId: w.id, type: "ASSEMBLY_OUT", qty: need, actorId: c.user.id, sourceRef: d.bundleId, reason: `Used to assemble ${d.qty}`, idempotencyKey: `asm:${d.key}:${k.componentId}` } }); }
      await tx.stockBalance.upsert({ where: { productId_warehouseId: { productId: d.bundleId, warehouseId: w.id } }, update: { sellable: { increment: d.qty } }, create: { orgId: c.orgId, productId: d.bundleId, warehouseId: w.id, sellable: d.qty } });
      await tx.stockMovement.create({ data: { orgId: c.orgId, productId: d.bundleId, warehouseId: w.id, type: "ASSEMBLY_IN", qty: d.qty, actorId: c.user.id, reason: "Assembled", idempotencyKey: `asm:${d.key}:in` } });
    }, { timeout: 30000 });
  } catch (e: any) {
    if (e.message === "NOBUNDLE") fail(BUNDLE_BACK, "Define what this product is made of first");
    if (String(e.message).startsWith("SHORT:")) { const x = await db.product.findUnique({ where: { id: e.message.slice(6) } }); fail(BUNDLE_BACK, `Not enough available stock of ${x?.name ?? "a part"} in ${w.name}`); }
    if (e.code !== "P2002") throw e; // P2002 = the same assembly was submitted twice
  }
  const parts = await db.bundleComponent.findMany({ where: { orgId: c.orgId, bundleId: d.bundleId }, select: { componentId: true } });
  await notifyLow(c.orgId, parts.map((x) => x.componentId)); await fulfilBackorders(c.orgId, w.id, c.user.id);
  revalidatePath(BUNDLE_BACK); revalidatePath("/inventory"); redirect(`${BUNDLE_BACK}?ok=${encodeURIComponent(`Assembled ${d.qty}.`)}`);
}
export async function setBin(fd: FormData) {
  const c = await guard(STOCK, "/inventory");
  const p = z.object({ productId: z.string(), warehouseId: z.string(), bin: z.string().trim().max(30) }).safeParse(Object.fromEntries(fd)); if (!p.success) fail("/inventory", "Bin labels can be up to 30 characters");
  await db.stockBalance.updateMany({ where: { orgId: c.orgId, productId: p.data!.productId, warehouseId: p.data!.warehouseId }, data: { bin: p.data!.bin || null } });
  revalidatePath("/inventory"); redirect("/inventory");
}

// ---- exchange rates ----------------------------------------------------------------------
export async function setRate(fd: FormData) {
  const c = await guard(["OWNER", "ACCOUNTANT"], "/settings");
  const p = z.object({ currency: z.enum(CODES.filter((x) => x !== "INR") as [string, ...string[]]), rate: z.coerce.number().positive().max(100000) }).safeParse(Object.fromEntries(fd)); if (!p.success) fail("/settings", "Choose a currency and enter how many rupees one unit is worth");
  await db.exchangeRate.upsert({ where: { orgId_currency: { orgId: c.orgId, currency: p.data!.currency } }, update: { rate: p.data!.rate }, create: { orgId: c.orgId, currency: p.data!.currency, rate: p.data!.rate } });
  revalidatePath("/settings"); done(`Saved: 1 ${p.data!.currency} = ₹${p.data!.rate}. New invoices use this rate; issued invoices keep the rate they were made with.`);
}
export async function deleteRate(fd: FormData) { const c = await guard(["OWNER", "ACCOUNTANT"], "/settings"); await db.exchangeRate.deleteMany({ where: { id: String(fd.get("id")), orgId: c.orgId } }); revalidatePath("/settings"); redirect("/settings"); }

/** Archive/restore without a redirect, so the page can show an "Undo" toast. Same permission as setArchived. */
async function setArchivedQuick(id: string, archived: boolean) {
  const c = await guard(STOCK, `/products/${id}`), r = await db.product.updateMany({ where: { id, orgId: c.orgId }, data: { archived } });
  if (!r.count) return { ok: false as const, error: "Product not found" };
  await db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: archived ? "product.archived" : "product.restored", detail: { id } } });
  revalidatePath("/products"); revalidatePath(`/products/${id}`); return { ok: true as const };
}
export async function archiveProductQuick(id: string) { return setArchivedQuick(String(id), true); }
export async function restoreProductQuick(id: string) { return setArchivedQuick(String(id), false); }
