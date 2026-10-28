import SubmitButton from "@/components/SubmitButton";
import { randomUUID } from "crypto";
import { Shell } from "@/components/Shell"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { addBill, payBill } from "@/app/actions"; import { inr } from "@/lib/gst";
export const dynamic = "force-dynamic";
const billNo = (n: number) => `BILL-${String(n).padStart(4, "0")}`, day = (d: Date) => d.toLocaleDateString("en-IN");
export default async function Bills({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const c = await ctx(), { e, ok } = await searchParams, canAdd = ["OWNER", "INVENTORY_MANAGER", "ACCOUNTANT"].includes(c.role), canPay = ["OWNER", "ACCOUNTANT"].includes(c.role);
  const [bills, ss] = await Promise.all([db.bill.findMany({ where: { orgId: c.orgId }, orderBy: { number: "desc" }, take: 50, include: { supplier: true, payments: { select: { amount: true } } } }), db.supplier.findMany({ where: { orgId: c.orgId }, orderBy: { name: "asc" }, take: 300 })]);
  const rows = bills.map((b) => { const paid = b.payments.reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0) / 100, amt = Number(b.amount), left = Math.round((amt - paid) * 100) / 100, late = left > 0 && b.dueOn < new Date();
    return [billNo(b.number), <span key="s">{b.supplier.name}{b.billNo ? <span className="block text-xs text-ink/60">Their inv. {b.billNo}</span> : null}</span>, day(b.dueOn), inr(amt), inr(left), left <= 0 ? "Paid" : late ? "Overdue" : paid > 0 ? "Partly paid" : "Unpaid",
      left > 0 && canPay ? <form key="f" action={payBill} className="grid min-w-[min(100%,240px)] grid-cols-2 gap-2"><input type="hidden" name="billId" value={b.id} /><input type="hidden" name="key" value={randomUUID()} />
        <input name="amount" type="number" step="0.01" min="0.01" max={left} defaultValue={left} aria-label="Amount" className={inp} /><select name="method" aria-label="Method" className={inp}>{["BANK", "UPI", "CASH", "CARD", "CHEQUE"].map((m) => <option key={m}>{m}</option>)}</select>
        <input name="reference" placeholder="UTR / cheque no." aria-label="Reference" className={`${inp} col-span-2`} /><SubmitButton className={`${ghost} col-span-2 py-2`}>Record payment</SubmitButton></form> : "—"]; });
  return <Shell title="Supplier bills"><Err e={e} />{ok && <p role="status" className="glass px-4 py-2 text-sm text-brand">{ok}</p>}
    <p className="text-sm text-ink/70">Bills are what you owe suppliers. Record the supplier's invoice here when goods arrive, then record each payment you make. Stock is unaffected: it changes only when you receive goods on the Purchases page.</p>
    {canAdd && <Panel title="Add a bill"><form action={addBill} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><input type="hidden" name="key" value={randomUUID()} />
      <label className="text-sm">Supplier<select name="supplierId" required className={inp}>{ss.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="text-sm">Supplier's invoice no.<input name="billNo" maxLength={40} className={inp} /></label><label className="text-sm">Amount (₹, with tax)<input name="amount" type="number" step="0.01" min="0.01" required className={inp} /></label>
      <label className="text-sm">Bill date<input name="billDate" type="date" defaultValue={new Date().toLocaleDateString("en-CA")} className={inp} /></label><label className="text-sm">Due date<input name="dueOn" type="date" required defaultValue={new Date(Date.now() + 30 * 864e5).toLocaleDateString("en-CA")} className={inp} /></label>
      <label className="text-sm">Note<input name="note" maxLength={200} className={inp} /></label><div className="sm:col-span-2 lg:col-span-3"><button className={btn} disabled={!ss.length}>Save bill</button>{!ss.length && <span className="ml-3 text-sm text-ink/60">Add a supplier first.</span>}</div></form></Panel>}
    <Table head={["Bill", "Supplier", "Due", "Amount", "Balance", "Status", "Pay"]} empty="No bills yet." rows={rows} /></Shell>;
}
