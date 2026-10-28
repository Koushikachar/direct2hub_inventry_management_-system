import { ctx } from "@/lib/ctx"; import { toCsv } from "@/lib/csv"; import { monthRange } from "@/lib/aging"; import { BUCKETS } from "@/lib/aging";
import { valuation, receivables, payables, salesByCustomer, gstSummary, salesRegister, reorderSuggestions } from "@/lib/reports";
export const dynamic = "force-dynamic";
/** CSV download for every report. Same role rule as the page: order staff can't export financial reports. */
export async function GET(req: Request) {
  const c = await ctx(); if (c.role === "ORDER_STAFF") return new Response("Forbidden", { status: 403 });
  const u = new URL(req.url).searchParams, r = u.get("r") ?? "", { key, from, to } = monthRange(u.get("m") ?? undefined); let head: string[], rows: unknown[][];
  if (r === "valuation") { const v = await valuation(c.orgId); head = ["sku", "product", "on_hand", "unit_cost", "value_at_cost", "selling_price", "value_at_price"]; rows = v.rows.map((x) => [x.sku, x.name, x.qty, x.cost, x.value, x.price, x.retail]); }
  else if (r === "receivables" || r === "payables") { const a = r === "receivables" ? await receivables(c.orgId) : await payables(c.orgId); head = [r === "receivables" ? "customer" : "supplier", ...BUCKETS, "total"]; rows = a.rows.map((x) => [x.party, ...x.buckets, x.total]); }
  else if (r === "customers") { const s = await salesByCustomer(c.orgId, from, to); head = ["customer", "invoices", "invoiced", "credit_notes", "net"]; rows = s.rows.map((x) => [x.name, x.docs, x.invoiced, x.credited, x.net]); }
  else if (r === "gst") { const g = await gstSummary(c.orgId, from, to); head = ["gst_rate", "taxable_value", "cgst", "sgst", "igst", "total_tax"]; rows = g.rows.map((x) => [x.rate, x.taxable, x.cgst, x.sgst, x.igst, x.tax]); }
  else if (r === "register") { const s = await salesRegister(c.orgId, from, to); head = ["type", "number", "date", "customer", "gstin", "place_of_supply", "taxable_value", "cgst", "sgst", "igst", "total"]; rows = s.map((x) => [x.type, x.no, x.date, x.customer, x.gstin, x.pos, x.taxable, x.cgst, x.sgst, x.igst, x.total]); }
  else if (r === "reorder") { const lead = Math.min(120, Math.max(0, Math.floor(Number(u.get("lead") ?? 7)) || 0)), safe = Math.min(60, Math.max(0, Math.floor(Number(u.get("safe") ?? 3)) || 0)), x = await reorderSuggestions(c.orgId, lead, safe);
    head = ["sku", "product", "available", "sold_90d", "per_day", "days_left", "current_reorder_level", "suggested_level", "suggested_order_qty"]; rows = x.map((y) => [y.sku, y.name, y.avail, y.sold, y.perDay.toFixed(2), y.daysLeft ?? "", y.reorderAt, y.level, y.qty]); }
  else return new Response("Unknown report", { status: 404 });
  const monthly = ["customers", "gst", "register"].includes(r);
  return new Response(toCsv(head, rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename=${r}${monthly ? `-${key}` : ""}.csv`, "cache-control": "no-store" } });
}
