import SubmitButton from "@/components/SubmitButton"; import OptimisticToggle from "@/components/OptimisticToggle";
import { Shell } from "@/components/Shell"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { EVENTS } from "@/lib/webhooks"; import { OPS } from "@/lib/rules";
import { createAutomation, toggleAutomation, deleteAutomation } from "@/app/actions";
export const dynamic = "force-dynamic";
const FIELDS: Record<string, string> = { "order.created": "number, status, customer, total", "order.confirmed": "number, status, customer, total", "order.dispatched": "number, status, customer, total", "order.cancelled": "number, status, customer, total",
  "invoice.created": "number, order, customer, subtotal, tax, total", "payment.received": "amount, method, reference", "stock.low": "sku, name, available, reorderAt", "goods.received": "accepted, rejected, note" };
export default async function Automations({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const c = await ctx(), { e, ok } = await searchParams;
  if (c.role !== "OWNER") return <Shell title="Automation rules"><p className="glass p-6 text-sm text-ink/70">Only the organization owner can manage automation rules.</p></Shell>;
  const rs = await db.automation.findMany({ where: { orgId: c.orgId }, orderBy: { createdAt: "desc" } }), ev = Object.fromEntries(EVENTS), op = Object.fromEntries(OPS);
  return <Shell title="Automation rules"><Err e={e} />{ok && <p role="status" className="glass px-4 py-2 text-sm text-brand">{ok}</p>}
    <p className="text-sm text-ink/70">"When something happens, and optionally a condition is true, do this." Rules run right after the event.</p>
    <Panel title="Add a rule"><form action={createAutomation} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm">Rule name<input name="name" required placeholder="Big order alert" className={inp} /></label>
      <label className="text-sm">When<select name="event" className={inp}>{EVENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 sm:col-span-2 lg:col-span-3"><label className="text-sm">Only if (field, optional)<input name="field" placeholder="total" className={inp} /></label>
        <label className="text-sm">Compare<select name="op" defaultValue="" className={inp}><option value="">No condition</option>{OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label><label className="text-sm">Value<input name="value" placeholder="10000" className={inp} /></label></div>
      <label className="text-sm">Then<select name="action" className={inp}><option value="NOTIFY">Notify me in the app</option><option value="EMAIL">Send an email</option></select></label>
      <label className="text-sm">Email to (for email)<input name="target" type="email" className={inp} /></label>
      <label className="text-sm sm:col-span-2 lg:col-span-3">Message (use {"{{field}}"} to insert values)<input name="template" required placeholder="Order {{number}} for {{customer}} is worth {{total}}" className={inp} /></label>
      <div><SubmitButton className={btn}>Add rule</SubmitButton></div></form>
      <details className="mt-3 text-xs text-ink/70"><summary className="cursor-pointer text-brand">Fields available for each event</summary><ul className="mt-1 space-y-0.5">{EVENTS.map(([k]) => <li key={k}><code>{k}</code>: {FIELDS[k]}</li>)}</ul></details></Panel>
    <Table head={["Rule","When","Then","Runs","Status"]} empty="No rules yet." rows={rs.map(r => [<div key="n"><b>{r.name}</b>{r.field && <div className="text-xs text-ink/60">only if {r.field} {op[r.op ?? ""]} {r.value}</div>}</div>, ev[r.event] ?? r.event, r.action === "EMAIL" ? `Email ${r.target}` : "Notify in app", `${r.runs}${r.lastRunAt ? ` · last ${r.lastRunAt.toLocaleDateString("en-IN")}` : ""}`,
      <div key="a" className="flex flex-wrap items-center gap-2"><OptimisticToggle id={r.id} active={r.active} action={toggleAutomation} label={`Rule ${r.name} is ${r.active ? "on" : "off"}`} /><form action={deleteAutomation}><input type="hidden" name="id" value={r.id} /><SubmitButton className={ghost}>Delete</SubmitButton></form></div>])} /></Shell>;
}
