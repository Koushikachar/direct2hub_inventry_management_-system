import { db } from "./db"; import { bucketOf, BUCKETS, reorderCalc } from "./aging"; import { cnNo, invNo } from "./gst";
const n = (v: unknown) => Number(v ?? 0), paise = (v: unknown) => Math.round(Number(v ?? 0) * 100), rs = (p: number) => p / 100;

/** Stock on hand (sellable, which includes units reserved for orders) valued at cost and at selling price. Top 500 products by value, plus whole-catalogue totals. */
export async function valuation(orgId: string) {
  const [rows, tot] = await Promise.all([
    db.$queryRaw<{ sku: string; name: string; qty: number; cost: unknown; price: unknown }[]>`SELECT p.sku, p.name, COALESCE(SUM(b.sellable),0)::int AS qty, p."unitCost" AS cost, p.price AS price FROM "Product" p LEFT JOIN "StockBalance" b ON b."productId"=p.id
      WHERE p."orgId"=${orgId} AND p.archived=false GROUP BY p.id ORDER BY COALESCE(SUM(b.sellable),0) * p."unitCost" DESC, p.name LIMIT 500`,
    db.$queryRaw<{ units: number; cost: unknown; retail: unknown }[]>`SELECT COALESCE(SUM(b.sellable),0)::int AS units, COALESCE(SUM(b.sellable * p."unitCost"),0) AS cost, COALESCE(SUM(b.sellable * p.price),0) AS retail
      FROM "StockBalance" b JOIN "Product" p ON p.id=b."productId" WHERE b."orgId"=${orgId} AND p.archived=false`]);
  return { rows: rows.map((r) => ({ sku: r.sku, name: r.name, qty: r.qty, cost: n(r.cost), price: n(r.price), value: rs(Math.round(r.qty * n(r.cost) * 100)), retail: rs(Math.round(r.qty * n(r.price) * 100)) })), units: tot[0]?.units ?? 0, cost: n(tot[0]?.cost), retail: n(tot[0]?.retail) };
}
type Aged = { party: string; buckets: number[]; total: number };
function group(items: { party: string; due: Date; left: number }[]) {
  const m = new Map<string, number[]>();
  for (const it of items) { if (it.left <= 0) continue; const a = m.get(it.party) ?? [0, 0, 0, 0, 0]; a[bucketOf(it.due)] += it.left; m.set(it.party, a); }
  const out: Aged[] = [...m].map(([party, b]) => ({ party, buckets: b.map(rs), total: rs(b.reduce((s, x) => s + x, 0)) })).sort((a, b) => b.total - a.total);
  return { rows: out, totals: BUCKETS.map((_, i) => rs(out.reduce((s, r) => s + Math.round(r.buckets[i] * 100), 0))), grand: rs(out.reduce((s, r) => s + Math.round(r.total * 100), 0)) };
}
/** What customers still owe: invoice total, less credit notes, less payments, grouped by customer and by how overdue it is. */
export async function receivables(orgId: string) {
  const inv = await db.invoice.findMany({ where: { orgId }, select: { customerName: true, total: true, dueOn: true, payments: { select: { amount: true } }, creditNotes: { select: { total: true } } }, orderBy: { dueOn: "asc" }, take: 5000 });
  return group(inv.map((i) => ({ party: i.customerName, due: i.dueOn, left: paise(i.total) - i.creditNotes.reduce((s, c) => s + paise(c.total), 0) - i.payments.reduce((s, p) => s + paise(p.amount), 0) })));
}
export async function payables(orgId: string) {
  const b = await db.bill.findMany({ where: { orgId }, select: { amount: true, dueOn: true, supplier: { select: { name: true } }, payments: { select: { amount: true } } }, orderBy: { dueOn: "asc" }, take: 5000 });
  return group(b.map((x) => ({ party: x.supplier.name, due: x.dueOn, left: paise(x.amount) - x.payments.reduce((s, p) => s + paise(p.amount), 0) })));
}
/** Invoiced value per customer in the period, net of credit notes issued in the same period. */
export async function salesByCustomer(orgId: string, from: Date, to: Date) {
  const [inv, cr] = await Promise.all([
    db.$queryRaw<{ name: string; docs: number; taxable: unknown; tax: unknown; total: unknown }[]>`SELECT "customerName" AS name, COUNT(*)::int AS docs, SUM(subtotal) AS taxable, SUM("taxTotal") AS tax, SUM(total) AS total FROM "Invoice" WHERE "orgId"=${orgId} AND "createdAt">=${from} AND "createdAt"<${to} GROUP BY "customerName"`,
    db.$queryRaw<{ name: string; total: unknown }[]>`SELECT i."customerName" AS name, SUM(c.total) AS total FROM "CreditNote" c JOIN "Invoice" i ON i.id=c."invoiceId" WHERE c."orgId"=${orgId} AND c."createdAt">=${from} AND c."createdAt"<${to} GROUP BY i."customerName"`]);
  const credit = new Map<string, number>(cr.map((c) => [c.name, n(c.total)] as [string, number])), names = new Set([...inv.map((i) => i.name), ...cr.map((c) => c.name)]);
  const rows = [...names].map((name) => { const i = inv.find((x) => x.name === name), invoiced = n(i?.total), cred = credit.get(name) ?? 0; return { name, docs: i?.docs ?? 0, invoiced, credited: cred, net: rs(Math.round(invoiced * 100) - Math.round(cred * 100)) }; }).sort((a, b) => b.net - a.net);
  return { rows, invoiced: rs(rows.reduce((s, r) => s + Math.round(r.invoiced * 100), 0)), credited: rs(rows.reduce((s, r) => s + Math.round(r.credited * 100), 0)), net: rs(rows.reduce((s, r) => s + Math.round(r.net * 100), 0)) };
}
/** Output GST by rate for the period, net of credit notes. CGST and SGST are each half of the intra-state tax. */
export async function gstSummary(orgId: string, from: Date, to: Date) {
  const [inv, cr] = await Promise.all([
    db.$queryRaw<{ rate: number; intra: boolean; taxable: unknown; tax: unknown }[]>`SELECT (l->>'taxRate')::int AS rate, i."intraState" AS intra, SUM((l->>'taxable')::numeric) AS taxable, SUM((l->>'tax')::numeric) AS tax
      FROM "Invoice" i CROSS JOIN LATERAL jsonb_array_elements(i.lines) AS l WHERE i."orgId"=${orgId} AND i."createdAt">=${from} AND i."createdAt"<${to} GROUP BY 1, 2`,
    db.$queryRaw<{ rate: number; intra: boolean; taxable: unknown; tax: unknown }[]>`SELECT (l->>'taxRate')::int AS rate, i."intraState" AS intra, SUM((l->>'taxable')::numeric) AS taxable, SUM((l->>'tax')::numeric) AS tax
      FROM "CreditNote" c JOIN "Invoice" i ON i.id=c."invoiceId" CROSS JOIN LATERAL jsonb_array_elements(c.lines) AS l WHERE c."orgId"=${orgId} AND c."createdAt">=${from} AND c."createdAt"<${to} GROUP BY 1, 2`]);
  const m = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  const add = (rows: typeof inv, sign: 1 | -1) => rows.forEach((r) => { const a = m.get(r.rate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 }, t = paise(r.tax) * sign; a.taxable += paise(r.taxable) * sign;
    if (r.intra) { const h = Math.trunc(t / 2); a.cgst += h; a.sgst += t - h; } else a.igst += t; m.set(r.rate, a); });
  add(inv, 1); add(cr, -1);
  const rows = [...m].sort((a, b) => a[0] - b[0]).map(([rate, a]) => ({ rate, taxable: rs(a.taxable), cgst: rs(a.cgst), sgst: rs(a.sgst), igst: rs(a.igst), tax: rs(a.cgst + a.sgst + a.igst) }));
  const sum = (k: "taxable" | "cgst" | "sgst" | "igst" | "tax") => rs(rows.reduce((s, r) => s + Math.round(r[k] * 100), 0));
  return { rows, totals: { taxable: sum("taxable"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), tax: sum("tax") } };
}
/** One line per invoice and credit note in the period (credit notes negative): the sheet your accountant files returns from. */
export async function salesRegister(orgId: string, from: Date, to: Date) {
  const [inv, cn] = await Promise.all([db.invoice.findMany({ where: { orgId, createdAt: { gte: from, lt: to } }, orderBy: { number: "asc" }, take: 5000 }),
    db.creditNote.findMany({ where: { orgId, createdAt: { gte: from, lt: to } }, orderBy: { number: "asc" }, take: 5000, include: { invoice: true } })]);
  const split = (tax: number, intra: boolean) => { const t = Math.round(tax * 100), h = intra ? Math.trunc(t / 2) : 0; return { cgst: rs(h), sgst: rs(intra ? t - h : 0), igst: rs(intra ? 0 : t) }; };
  const d = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return [...inv.map((i) => ({ type: "Invoice", no: invNo(i.number), date: d(i.createdAt), customer: i.customerName, gstin: i.customerGstin ?? "", pos: i.customerState ?? "", taxable: n(i.subtotal), ...split(n(i.taxTotal), i.intraState), total: n(i.total) })),
    ...cn.map((c) => ({ type: "Credit note", no: cnNo(c.number), date: d(c.createdAt), customer: c.invoice.customerName, gstin: c.invoice.customerGstin ?? "", pos: c.invoice.customerState ?? "", taxable: -n(c.subtotal), ...(() => { const s = split(n(c.taxTotal), c.invoice.intraState); return { cgst: -s.cgst, sgst: -s.sgst, igst: -s.igst }; })(), total: -n(c.total) }))];
}

/** Which products to reorder, from how fast they really sell. Sales speed = units on dispatched/delivered orders over the last 90 days. */
export async function reorderSuggestions(orgId: string, lead: number, safety: number) {
  const WINDOW = 90, since = new Date(Date.now() - WINDOW * 864e5);
  const rows = await db.$queryRaw<{ id: string; sku: string; name: string; reorderAt: number; avail: number; sold: number }[]>`SELECT p.id, p.sku, p.name, p."reorderAt" AS "reorderAt", COALESCE(s.avail,0)::int AS avail, COALESCE(d.sold,0)::int AS sold FROM "Product" p
    LEFT JOIN (SELECT "productId", SUM(sellable - reserved) AS avail FROM "StockBalance" WHERE "orgId"=${orgId} GROUP BY "productId") s ON s."productId"=p.id
    LEFT JOIN (SELECT l."productId", SUM(l.qty) AS sold FROM "OrderLine" l JOIN "Order" o ON o.id=l."orderId" WHERE o."orgId"=${orgId} AND o.status::text IN ('DISPATCHED','DELIVERED') AND o."createdAt">=${since} GROUP BY l."productId") d ON d."productId"=p.id
    WHERE p."orgId"=${orgId} AND p.archived=false`;
  const out = rows.map((r) => ({ ...r, ...reorderCalc(r.avail, r.sold, WINDOW, lead, safety) })).filter((r) => r.need || (r.reorderAt > 0 && r.avail <= r.reorderAt));
  return out.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || b.perDay - a.perDay).slice(0, 300);
}
