"use client";
import SubmitButton from "@/components/SubmitButton";
import { useEffect, useState } from "react";
import { inp, btn } from "@/components/ui"; import { stockState, suggestOrderQty } from "@/lib/stockstate";
export type PoProduct = { id: string; label: string; available: number; onHand: number; incoming: number; reorderAt: number; cost: number };
/** New purchase order form. Choosing a product shows what you have, what is already on order and your reorder level, and suggests a quantity. */
export default function PoForm({ action, suppliers, products }: { action: (fd: FormData) => void | Promise<void>; suppliers: { id: string; name: string }[]; products: PoProduct[] }) {
  const [pid, setPid] = useState(products[0]?.id ?? ""), [qty, setQty] = useState(""), [cost, setCost] = useState(String(products[0]?.cost ?? "")), p = products.find((x) => x.id === pid);
  const [key, setKey] = useState(""); useEffect(() => setKey(crypto.randomUUID()), []); // made in the browser, so the page can be built ahead of time without a mismatch
  const state = p ? stockState(p.available, p.reorderAt) : "ok", suggest = p ? suggestOrderQty(p.available, p.incoming, p.reorderAt) : 0;
  return <form action={action} className="space-y-3"><input type="hidden" name="key" value={key} /><div className="grid gap-3 sm:grid-cols-5">
    <label className="text-sm">Supplier<select name="supplierId" required className={inp}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="text-sm sm:col-span-2">Product<select name="productId" required value={pid} onChange={(e) => { setPid(e.target.value); const n = products.find((x) => x.id === e.target.value); if (n) setCost(String(n.cost)); }} className={inp}>
      {products.map((q) => <option key={q.id} value={q.id}>{q.label} · {q.available <= 0 ? "out of stock" : `${q.available} available`}</option>)}</select></label>
    <label className="text-sm">Quantity<input name="qty" type="number" min={1} required value={qty} onChange={(e) => setQty(e.target.value)} className={inp} /></label>
    <label className="text-sm">Unit cost (₹)<input name="unitCost" type="number" min={0} step="any" required value={cost} onChange={(e) => setCost(e.target.value)} className={inp} /></label></div>
    {p && <div role="status" className={`flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl px-3 py-2 text-sm ${state === "ok" ? "bg-white/50" : state === "low" ? "bg-turmeric/20" : "bg-danger/10"}`}>
      <span><b>{p.available}</b> available{state === "out" ? " (out of stock)" : state === "low" ? " (low)" : ""}</span><span>{p.onHand} on hand</span><span>{p.incoming} already on order</span><span>Reorder level {p.reorderAt}</span>
      {suggest > 0 && <button type="button" onClick={() => setQty(String(suggest))} className="font-semibold text-brand underline">Order {suggest} (tops up to twice your reorder level)</button>}</div>}
    <SubmitButton className={btn}>Create PO</SubmitButton></form>;
}
