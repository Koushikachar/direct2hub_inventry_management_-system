"use client";
import { useState } from "react";
import { inp } from "@/components/ui"; import { orderHint, stockLabel } from "@/lib/stockstate";
export type OrderProduct = { id: string; label: string; available: number; elsewhere: number; reorderAt: number; isKit: boolean };
const tone = { warn: "text-danger", low: "rounded-lg bg-turmeric/20 px-2 py-1 text-ink", ok: "text-brand" } as const;
/** The product rows of the New order form. Every product shows how many are available, and under each line you see right away if the quantity is more than you have, or would leave you low. */
export default function OrderLines({ products }: { products: OrderProduct[] }) {
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, () => ({ id: "", qty: "1" }))), by = new Map<string, OrderProduct>(products.map((p) => [p.id, p] as [string, OrderProduct]));
  const set = (i: number, v: Partial<{ id: string; qty: string }>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...v } : x)));
  return <>{rows.map((r, i) => { const n = i + 1, p = by.get(r.id), h = p ? orderHint({ qty: Number(r.qty), available: p.available, elsewhere: p.elsewhere, reorderAt: p.reorderAt }) : null;
    return <div key={n} className="space-y-1"><div className="grid gap-3 sm:grid-cols-[1fr_120px]">
      <select name={`p${n}`} aria-label={`Product ${n}`} value={r.id} onChange={(e) => set(i, { id: e.target.value })} className={inp}><option value="">{n === 1 ? "Choose a product" : "Add another product (optional)"}</option>
        {products.map((q) => <option key={q.id} value={q.id}>{q.label} · {q.isKit ? `can sell ${q.available}` : stockLabel(q.available, q.reorderAt)}</option>)}</select>
      <input name={`q${n}`} type="number" min={1} value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label={`Quantity ${n}`} className={inp} /></div>
      {h && <p role={h.tone === "warn" ? "alert" : "status"} className={`text-sm ${tone[h.tone]}`}>{h.text}</p>}</div>; })}</>;
}
