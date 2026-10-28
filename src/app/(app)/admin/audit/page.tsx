import SubmitButton from "@/components/SubmitButton";
import { Shell } from "@/components/Shell"; import AdminTabs from "@/components/AdminTabs"; import { Table, inp, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { adminGuard } from "@/lib/admin";
export const dynamic = "force-dynamic";
export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await adminGuard(); const { q } = await searchParams;
  const logs = await db.auditLog.findMany({ where: q ? { action: { contains: q, mode: "insensitive" } } : {}, orderBy: { createdAt: "desc" }, take: 100 });
  const [us, os] = await Promise.all([db.user.findMany({ where: { id: { in: [...new Set(logs.map(l => l.actorId))] } } }), db.organization.findMany({ where: { id: { in: logs.flatMap(l => l.orgId ? [l.orgId] : []) } } })]);
  const u = Object.fromEntries(us.map(x => [x.id, x.email])), o = Object.fromEntries(os.map(x => [x.id, x.name]));
  return <Shell title="Audit log" active="Admin" admin><AdminTabs current="Audit log" />
    <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Filter by action, e.g. org.suspended" aria-label="Filter actions" className={inp} /><SubmitButton className={ghost}>Filter</SubmitButton></form>
    <Table head={["When","Action","By","Organization","Details"]} empty="No entries match." rows={logs.map(l => [l.createdAt.toLocaleString("en-IN"), l.action, u[l.actorId] ?? l.actorId, (l.orgId && o[l.orgId]) || "—", l.detail ? JSON.stringify(l.detail).slice(0, 120) : "—"])} /></Shell>;
}
