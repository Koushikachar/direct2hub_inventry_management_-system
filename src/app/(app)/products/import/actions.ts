"use server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx";
import { parseCsv, validateRows, validateSuppliers, type RowError } from "@/lib/csv";
export type ImportState = { step: "idle" | "preview" | "done" | "error"; msg?: string; errors?: RowError[]; valid?: number; cols?: string[]; sample?: Record<string, string | number>[]; csv?: string };
const MAX = 1_000_000, ROWS = 2000;
async function check(text: string) {
  const c = await ctx();
  if (!["OWNER", "INVENTORY_MANAGER"].includes(c.role)) return { c, err: "You don't have permission to import products" } as const;
  const rows = parseCsv(text); if (rows.length > ROWS + 1) return { c, err: `Import up to ${ROWS} rows at a time` } as const;
  const existing = new Set((await db.product.findMany({ where: { orgId: c.orgId }, select: { sku: true } })).map((p) => p.sku));
  return { c, ...validateRows(rows, existing) } as const;
}
export async function previewCsv(_: ImportState, fd: FormData): Promise<ImportState> {
  const f = fd.get("file"); if (!(f instanceof File) || !f.size) return { step: "error", msg: "Choose a .csv file" };
  if (f.size > MAX) return { step: "error", msg: "File is larger than 1 MB" };
  const text = await f.text(), r = await check(text); if ("err" in r) return { step: "error", msg: r.err };
  return { step: "preview", csv: text, valid: r.valid.length, errors: r.errors.slice(0, 50), cols: ["SKU", "Name", "Price", "Cost", "Reorder", "Opening"], sample: r.valid.slice(0, 8).map((v) => ({ SKU: v.sku, Name: v.name, Price: v.price, Cost: v.cost, Reorder: v.reorder, Opening: v.opening })), msg: r.errors.length > 50 ? `Showing the first 50 of ${r.errors.length} errors` : undefined };
}
/** Re-parses and re-validates on the server; the browser's preview is never trusted. Valid rows are committed in one transaction. */
export async function commitCsv(_: ImportState, fd: FormData): Promise<ImportState> {
  const text = String(fd.get("csv") ?? ""); if (text.length > MAX) return { step: "error", msg: "File is larger than 1 MB" };
  const r = await check(text); if ("err" in r) return { step: "error", msg: r.err };
  if (!r.valid.length) return { step: "error", msg: "No valid rows to import" };
  const lim = await (await import("@/lib/plan")).checkLimit(r.c.orgId, "products", r.valid.length); if (lim) return { step: "error", msg: lim };
  const { c } = r, w = await db.warehouse.findFirstOrThrow({ where: { orgId: c.orgId }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] });
  const rows = r.valid.map((v) => ({ ...v, id: randomUUID() }));
  try {
    await db.$transaction([
      db.product.createMany({ data: rows.map((v) => ({ id: v.id, orgId: c.orgId, sku: v.sku, name: v.name, price: v.price, unitCost: v.cost, reorderAt: v.reorder })) }),
      db.stockBalance.createMany({ data: rows.map((v) => ({ orgId: c.orgId, productId: v.id, warehouseId: w.id, sellable: v.opening })) }),
      db.stockMovement.createMany({ data: rows.filter((v) => v.opening > 0).map((v) => ({ orgId: c.orgId, productId: v.id, warehouseId: w.id, type: "OPENING" as const, qty: v.opening, actorId: c.user.id, sourceRef: "csv-import", idempotencyKey: `open:${v.id}` })) }),
      db.notification.create({ data: { orgId: c.orgId, kind: "import", title: "Product import finished", body: `${rows.length} imported, ${r.errors.length} skipped`, href: "/products" } }),
      db.auditLog.create({ data: { orgId: c.orgId, actorId: c.user.id, action: "products.imported", detail: { imported: rows.length, skipped: r.errors.length } } }),
    ]);
  } catch (e: any) { return { step: "error", msg: e?.code === "P2002" ? "A SKU was added while you were previewing. Upload the file again" : "Import failed. Nothing was saved" }; }
  return { step: "done", msg: `Imported ${rows.length} products${r.errors.length ? `; skipped ${r.errors.length} rows with errors` : ""}.` };
}

async function checkS(text: string) {
  const c = await ctx();
  if (!["OWNER", "INVENTORY_MANAGER", "ACCOUNTANT"].includes(c.role)) return { c, err: "You don't have permission to import suppliers" } as const;
  const rows = parseCsv(text); if (rows.length > ROWS + 1) return { c, err: `Import up to ${ROWS} rows at a time` } as const;
  const existing = new Set((await db.supplier.findMany({ where: { orgId: c.orgId }, select: { name: true } })).map((s) => s.name.toLowerCase()));
  return { c, ...validateSuppliers(rows, existing) } as const;
}
export async function previewSuppliers(_: ImportState, fd: FormData): Promise<ImportState> {
  const f = fd.get("file"); if (!(f instanceof File) || !f.size) return { step: "error", msg: "Choose a .csv file" };
  if (f.size > MAX) return { step: "error", msg: "File is larger than 1 MB" };
  const text = await f.text(), r = await checkS(text); if ("err" in r) return { step: "error", msg: r.err };
  return { step: "preview", csv: text, valid: r.valid.length, errors: r.errors.slice(0, 50), cols: ["Name", "Phone", "Email"], sample: r.valid.slice(0, 8).map((v) => ({ Name: v.name, Phone: v.phone || "—", Email: v.email || "—" })), msg: r.errors.length > 50 ? `Showing the first 50 of ${r.errors.length} errors` : undefined };
}
/** Re-validated on the server before saving; rows with errors are skipped. */
export async function commitSuppliers(_: ImportState, fd: FormData): Promise<ImportState> {
  const text = String(fd.get("csv") ?? ""); if (text.length > MAX) return { step: "error", msg: "File is larger than 1 MB" };
  const r = await checkS(text); if ("err" in r) return { step: "error", msg: r.err };
  if (!r.valid.length) return { step: "error", msg: "No valid rows to import" };
  try {
    await db.$transaction([db.supplier.createMany({ data: r.valid.map((v) => ({ orgId: r.c.orgId, name: v.name, phone: v.phone || null, email: v.email || null })) }),
      db.auditLog.create({ data: { orgId: r.c.orgId, actorId: r.c.user.id, action: "suppliers.imported", detail: { imported: r.valid.length, skipped: r.errors.length } } })]);
  } catch { return { step: "error", msg: "Import failed. Nothing was saved" }; }
  return { step: "done", msg: `Imported ${r.valid.length} suppliers${r.errors.length ? `; skipped ${r.errors.length} rows with errors` : ""}.` };
}
