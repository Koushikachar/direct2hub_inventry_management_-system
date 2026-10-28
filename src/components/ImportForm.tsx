"use client";
import { useActionState } from "react";
import { previewCsv, commitCsv, previewSuppliers, commitSuppliers, type ImportState } from "@/app/(app)/products/import/actions";
import { inp, btn } from "./ui";
const init: ImportState = { step: "idle" };
export default function ImportForm({ kind = "products" }: { kind?: "products" | "suppliers" }) {
  const [pv, cm] = kind === "suppliers" ? [previewSuppliers, commitSuppliers] : [previewCsv, commitCsv];
  const [p, pAct, pBusy] = useActionState(pv, init), [d, dAct, dBusy] = useActionState(cm, init), done = d.step === "done";
  return <div className="space-y-5">
    <form action={pAct} className="flex flex-col gap-2 sm:flex-row"><input type="file" name="file" accept=".csv,text/csv" required className={inp} aria-label="CSV file" /><button className={btn} disabled={pBusy}>{pBusy ? "Checking…" : "Preview"}</button></form>
    {(p.step === "error" || d.step === "error") && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">{d.step === "error" ? d.msg : p.msg}</p>}
    {done && <p role="status" className="glass px-4 py-2 text-sm text-brand">{d.msg}</p>}
    {p.step === "preview" && !done && <div className="space-y-3">
      <p className="text-sm"><b>{p.valid}</b> rows ready to import, <b className={p.errors?.length ? "text-danger" : ""}>{p.errors?.length ?? 0}</b> with errors{p.msg ? ` (${p.msg})` : ""}. Rows with errors are skipped.</p>
      {!!p.errors?.length && <ul className="glass max-h-56 overflow-auto text-sm">{p.errors.map((e) => <li key={e.row} className="border-b border-white/60 px-3 py-1.5 last:border-0"><b>Row {e.row}:</b> {e.msg}</li>)}</ul>}
      {!!p.sample?.length && p.cols && <div className="glass overflow-x-auto"><table className="w-full text-sm"><thead className="bg-white/40 text-left"><tr>{p.cols.map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{p.sample.map((r, i) => <tr key={i} className="border-t border-white/60">{p.cols!.map(c => <td key={c} className="px-3 py-1.5">{r[c]}</td>)}</tr>)}</tbody></table></div>}
      <form action={dAct}><textarea name="csv" defaultValue={p.csv} hidden readOnly /><button className={btn} disabled={dBusy || !p.valid}>{dBusy ? "Importing…" : `Import ${p.valid} ${kind}`}</button></form></div>}
  </div>;
}
