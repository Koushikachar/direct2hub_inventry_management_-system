import Link from "next/link";
import { Shell, Stat } from "@/components/Shell"; import AdminTabs from "@/components/AdminTabs"; import { Err, Table, inp, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { adminGuard } from "@/lib/admin"; import { PLANS } from "@/lib/plans"; import { rupees, receiptNo, methodsEnabled } from "@/lib/billing"; import { reviewPayment } from "../actions";
export const dynamic = "force-dynamic";
export default async function AdminSubscriptions({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  await adminGuard(); const { e, ok } = await searchParams, since = new Date(Date.now() - 30 * 864e5);
  const [queue, recent, active, rev] = await Promise.all([
    db.subscriptionPayment.findMany({ where: { status: "PENDING", method: { in: ["UPI", "BANK"] }, reference: { not: null } }, orderBy: { createdAt: "asc" }, take: 50, include: { org: { select: { name: true } } } }),
    db.subscriptionPayment.findMany({ orderBy: { createdAt: "desc" }, take: 25, include: { org: { select: { name: true } } } }),
    db.subscription.count({ where: { status: { in: ["ACTIVE", "PAST_DUE"] }, currentPeriodEnd: { gt: new Date() } } }),
    db.subscriptionPayment.aggregate({ where: { status: "PAID", paidAt: { gte: since } }, _sum: { total: true }, _count: true })]);
  const on = methodsEnabled();
  return <Shell title="Platform admin"><AdminTabs current="Subscriptions" /><Err e={e} />{ok && <p role="status" className="glass px-4 py-2 text-sm text-brand">{ok}</p>}
    <div className="grid gap-4 sm:grid-cols-3"><Stat label="Paying organizations" value={active} /><Stat label="Collected, last 30 days" value={rupees(rev._sum.total ?? 0)} hint={`${rev._count} payments, GST included`} /><Stat label="To verify" value={queue.length} tone="warn" hint="UPI / bank payments with a reference" /></div>
    <p className="text-xs text-ink/60">Payment ways switched on: {(Object.keys(on) as (keyof typeof on)[]).map((k) => `${k} ${on[k] ? "✓" : "✗"}`).join(" · ")}</p>
    <h2 className="font-semibold">Waiting for your verification</h2>
    <Table head={["Organization", "Amount", "Method", "Reference", "Submitted", "Decision"]} empty="Nothing to verify." rows={queue.map((q) => [<span key="o">{q.org.name}<span className="block text-xs text-ink/60">{PLANS[q.plan]?.label ?? q.plan} · {q.interval.toLowerCase()}</span></span>, <b key="a">{rupees(q.total)}</b>, q.method, <span key="r" className="select-all">{q.reference}{q.payerName ? ` (${q.payerName})` : ""}</span>, q.createdAt.toLocaleString("en-IN"),
      <form key="f" action={reviewPayment} className="flex min-w-[min(100%,260px)] flex-wrap gap-2"><input type="hidden" name="id" value={q.id} /><input name="note" placeholder="Reason if rejecting" aria-label="Rejection reason" className={`${inp} flex-1`} />
        <button name="d" value="approve" className={ghost}>Approve</button><button name="d" value="reject" className={`${ghost} text-danger`}>Reject</button></form>])} />
    <p className="text-xs text-ink/60">Approve only after you've seen the exact amount with this reference in your bank or UPI statement.</p>
    <h2 className="font-semibold">Recent payments</h2>
    <Table head={["When", "Organization", "Plan", "Method", "Amount", "Status"]} empty="No payments yet." rows={recent.map((r) => [r.createdAt.toLocaleString("en-IN"), <Link key="o" href={`/admin/orgs/${r.orgId}`} className="text-brand underline">{r.org.name}</Link>, PLANS[r.plan]?.label ?? r.plan, r.method, rupees(r.total), r.status === "PAID" ? `paid · ${receiptNo(r.number)}` : r.status.toLowerCase()])} /></Shell>;
}
