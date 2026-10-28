export function parseCsv(t: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += ch; }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
export type Row = { sku: string; name: string; price: number; cost: number; reorder: number; opening: number };
export type RowError = { row: number; msg: string };
const REQ = ["sku", "name", "price", "unit_cost"];
export function validateRows(rows: string[][], existing: Set<string>) {
  const valid: Row[] = [], errors: RowError[] = [];
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase().replace(/^\ufeff/, ""));
  const miss = REQ.filter((c) => !head.includes(c));
  if (miss.length) return { valid, errors: [{ row: 1, msg: `Missing column: ${miss.join(", ")}` }] };
  const ix = (c: string) => head.indexOf(c), seen = new Map<string, number>();
  rows.slice(1).forEach((r, i) => {
    const n = i + 2; if (r.every((c) => !c.trim())) return;
    const g = (c: string) => (r[ix(c)] ?? "").trim(), bad: string[] = [];
    const sku = g("sku"), name = g("name"), price = Number(g("price")), cost = Number(g("unit_cost"));
    const reorder = g("reorder_at") === "" ? 0 : Number(g("reorder_at")), opening = g("opening_stock") === "" ? 0 : Number(g("opening_stock"));
    if (!sku) bad.push("SKU is empty"); else if (seen.has(sku)) bad.push(`Duplicate SKU in file (first on row ${seen.get(sku)})`); else if (existing.has(sku)) bad.push("SKU already exists in your catalog");
    if (!name) bad.push("Name is empty");
    if (g("price") === "" || !(price >= 0) || !isFinite(price)) bad.push("Price must be a number, 0 or more");
    if (g("unit_cost") === "" || !(cost >= 0) || !isFinite(cost)) bad.push("unit_cost must be a number, 0 or more");
    if (!Number.isInteger(reorder) || reorder < 0) bad.push("reorder_at must be a whole number, 0 or more");
    if (!Number.isInteger(opening) || opening < 0) bad.push("opening_stock must be a whole number, 0 or more");
    if (sku && !seen.has(sku)) seen.set(sku, n);
    if (bad.length) errors.push({ row: n, msg: bad.join("; ") }); else valid.push({ sku, name, price, cost, reorder, opening });
  });
  return { valid, errors };
}

export type SupplierRow = { name: string; phone: string; email: string };
export function validateSuppliers(rows: string[][], existing: Set<string>) {
  const valid: SupplierRow[] = [], errors: RowError[] = [];
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase().replace(/^\ufeff/, ""));
  if (!head.includes("name")) return { valid, errors: [{ row: 1, msg: "Missing column: name" }] };
  const ix = (c: string) => head.indexOf(c), seen = new Map<string, number>();
  rows.slice(1).forEach((r, i) => {
    const n = i + 2; if (r.every((c) => !c.trim())) return;
    const g = (c: string) => (r[ix(c)] ?? "").trim(), name = g("name"), phone = g("phone"), email = g("email"), k = name.toLowerCase(), bad: string[] = [];
    if (!name) bad.push("Name is empty"); else if (seen.has(k)) bad.push(`Duplicate supplier in file (first on row ${seen.get(k)})`); else if (existing.has(k)) bad.push("A supplier with this name already exists");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad.push("Email isn't valid");
    if (name && !seen.has(k)) seen.set(k, n);
    if (bad.length) errors.push({ row: n, msg: bad.join("; ") }); else valid.push({ name, phone, email });
  });
  return { valid, errors };
}

/** Spreadsheet-safe CSV: values starting with = + - @ are prefixed so Excel can't run them as formulas. */
export const csvCell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
export const toCsv = (head: string[], rows: unknown[][]) => [head.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
