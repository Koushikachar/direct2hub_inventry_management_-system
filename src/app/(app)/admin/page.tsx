import Link from "next/link";
import { Shell, Stat } from "@/components/Shell"; import AdminTabs from "@/components/AdminTabs"; import { Table } from "@/components/ui";
import { db } from "@/lib/db"; import { adminGuard } from "@/lib/admin";
export const dynamic = "force-dynamic";
const REAL = { id: { not: "platform" } };
export default async function Admin() {
  await adminGuard();
  const since = new Date(Date.now() - 7 * 864e5);
  const [orgs, susp, users, orders, products, newOrgs, newUsers, recent, audit] = await Promise.all([
    db.organization.count({ where: REAL }), db.organization.count({ where: { suspended: true } }), db.user.count(), db.order.count(), db.product.count(),
    db.organization.count({ where: { ...REAL, createdAt: { gte: since } } }), db.user.count({ where: { createdAt: { gte: since } } }),
    db.organization.findMany({ where: REAL, orderBy: { createdAt: "desc" }, take: 5, include: { _count: { select: { members: true } } } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 })]);
  return <Shell title="Platform admin" active="Admin" admin><AdminTabs current="Overview" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Organizations" value={orgs} hint={`${newOrgs} new in 7 days`} /><Stat label="Users" value={users} hint={`${newUsers} new in 7 days`} />
      <Stat label="Suspended orgs" value={susp} tone="warn" /><Stat label="Orders · Products" value={`${orders} · ${products}`} hint="Across all organizations" /></div>
    <h2 className="font-semibold">Newest organizations</h2>
    <Table head={["Name","Members","Joined"]} empty="No organizations yet." rows={recent.map(o => [<Link key="n" href={`/admin/orgs/${o.id}`} className="font-medium text-brand underline">{o.name}</Link>, o._count.members, o.createdAt.toLocaleDateString("en-IN")])} />
    <h2 className="font-semibold">Recent privileged actions</h2>
    <Table head={["Action","When"]} empty="Nothing recorded yet." rows={audit.map(a => [a.action, a.createdAt.toLocaleString("en-IN")])} /></Shell>;
}
