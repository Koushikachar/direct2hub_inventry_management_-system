"use client";
import { useMemo, useState } from "react";
import SubmitButton from "./SubmitButton";
type W = { id: string; name: string }; type P = { id: string; name: string; sku: string };
/** key = `${productId}:${warehouseId}`, value = [sellable, reserved] */
export default function TransferForm({ action, formKey, products, warehouses, stock, inp, btn }: { action: (fd: FormData) => void | Promise<void>; formKey: string; products: P[]; warehouses: W[]; stock: Record<string, [number, number]>; inp: string; btn: string }) {
  const [pid, setPid] = useState(products[0]?.id ?? ""), [from, setFrom] = useState(warehouses[0]?.id ?? ""), [to, setTo] = useState(warehouses[1]?.id ?? warehouses[0]?.id ?? ""), [qty, setQty] = useState("");
  const avail = (w: string) => { const s = stock[`${pid}:${w}`]; return s ? Math.max(0, s[0] - s[1]) : 0; };
  const total = useMemo(() => warehouses.reduce((t, w) => t + avail(w.id), 0), [pid, warehouses, stock]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = avail(from), n = Number(qty), over = qty !== "" && n > max, same = from === to;
  return <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="key" value={formKey} />
    <label className="text-sm sm:col-span-2">Product<select name="productId" required value={pid} onChange={(e) => { setPid(e.target.value); setQty(""); }} className={inp}>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></label>
    <label className="text-sm">From<select name="fromId" value={from} onChange={(e) => { setFrom(e.target.value); setQty(""); }} className={inp}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} · {avail(w.id)} available</option>)}</select></label>
    <label className="text-sm">To<select name="toId" value={to} onChange={(e) => setTo(e.target.value)} className={inp}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} · {avail(w.id)} available</option>)}</select></label>
    <div className="glass flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm sm:col-span-2 lg:col-span-4" aria-live="polite"><span className="font-medium">Stock of this product</span>
      {warehouses.map((w) => <span key={w.id} className={w.id === from ? "font-semibold text-brand" : ""}>{w.name}: <b className="tabular-nums">{avail(w.id)}</b></span>)}<span className="text-ink/60">Total: <b className="tabular-nums">{total}</b></span></div>
    <label className="text-sm">Quantity <span className="text-ink/60">(max {max})</span><input name="qty" type="number" min={1} max={max || undefined} step={1} required value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={over || undefined} className={inp} /></label>
    <label className="text-sm sm:col-span-2">Note (optional)<input name="note" maxLength={200} className={inp} /></label>
    <div className="self-end"><SubmitButton className={btn} disabled={over || same || max < 1}>Transfer</SubmitButton></div>
    {(over || same || max < 1) && <p role="alert" className="text-sm text-danger sm:col-span-2 lg:col-span-4">{same ? "Choose two different warehouses." : max < 1 ? "There is no available stock of this product in the From warehouse." : `Only ${max} available in the From warehouse.`}</p>}</form>;
}
