import SubmitButton from "@/components/SubmitButton";
import { notFound } from "next/navigation";
import { Shell, Stat } from "@/components/Shell"; import AdminTabs, { Pill } from "@/components/AdminTabs"; import { Err, Panel, Table, inp, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { adminGuard } from "@/lib/admin"; import { setSuspended, setPlan } from "../../actions";
export const dynamic = "force-dynamic";
export default async function OrgDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; ok?: string }> }) {
  await adminGuard(); const { id } = await params, { e, ok } = await searchParams;
  const o = await db.organization.findUnique({ where: { id }, include: { members: { include: { user: true } }, _count: { select: { products: true, orders: true, suppliers: true } } } });
  if (!o) notFound();
  const mv = await db.stockMovement.findMany({ where: { orgId: id }, orderBy: { createdAt: "desc" }, take: 10 });
  return <Shell title={o.name} active="Admin" admin><AdminTabs current="Organizations" /><Err e={e} />{ok && <p role="status" className="glass px-4 py-2 text-sm text-brand">{ok}</p>}
    <div className="grid gap-4 sm:grid-cols-4"><Stat label="Members" value={o.members.length} /><Stat label="Products" value={o._count.products} /><Stat label="Orders" value={o._count.orders} /><Stat label="Suppliers" value={o._count.suppliers} /></div>
    <Panel title="Access"><div className="mb-3 flex items-center gap-3 text-sm">Status: <Pill on={o.suspended} yes="Suspended" no="Active" /></div>
      <form action={setSuspended} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={o.id} /><input type="hidden" name="suspend" value={o.suspended ? "0" : "1"} />
        {!o.suspended && <input name="reason" required minLength={3} placeholder="Reason (saved in the audit log)" aria-label="Reason" className={`${inp} max-w-sm`} />}
        <button className={o.suspended ? ghost : "rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"}>{o.suspended ? "Reactivate" : "Suspend organization"}</button></form>
      {!o.suspended && <p className="mt-2 text-xs text-ink/60">Suspending locks every member out of the app until you reactivate.</p>}</Panel>
    <Panel title="Plan"><form action={setPlan} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={o.id} />
      <select name="plan" defaultValue={o.plan} aria-label="Plan" className={`${inp} w-44`}>{["FREE","GROWTH","SCALE"].map(x => <option key={x}>{x}</option>)}</select><SubmitButton className={ghost}>Change plan</SubmitButton></form>
      <p className="mt-2 text-xs text-ink/60">Limits are enforced on products and team size. Customers can pay for plans themselves on their My plan page; setting a plan here is a manual grant that doesn't expire.</p></Panel>
    <h2 className="font-semibold">Members</h2>
    <Table head={["Email","Name","Role"]} empty="No members." rows={o.members.map(m => [m.user.email, m.user.name ?? "—", m.role])} />
    <h2 className="font-semibold">Latest stock movements</h2>
    <Table head={["When","Type","Qty"]} empty="No stock activity yet." rows={mv.map(m => [m.createdAt.toLocaleString("en-IN"), m.type, m.qty])} /></Shell>;
}
