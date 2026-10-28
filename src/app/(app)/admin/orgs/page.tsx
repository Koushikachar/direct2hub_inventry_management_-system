import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { Shell } from "@/components/Shell"; import AdminTabs, { Pill } from "@/components/AdminTabs"; import { Table, inp, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { adminGuard } from "@/lib/admin";
export const dynamic = "force-dynamic";
export default async function Orgs({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await adminGuard(); const { q } = await searchParams;
  const os = await db.organization.findMany({ where: { id: { not: "platform" }, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) }, orderBy: { createdAt: "desc" }, take: 100,
    include: { _count: { select: { members: true, products: true, orders: true } } } });
  return <Shell title="Organizations" active="Admin" admin><AdminTabs current="Organizations" />
    <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search by name" aria-label="Search organizations" className={inp} /><SubmitButton className={ghost}>Search</SubmitButton></form>
    <Table head={["Name","Members","Products","Orders","Joined","Status"]} empty="No organizations match." rows={os.map(o => [
      <Link key="n" href={`/admin/orgs/${o.id}`} className="font-medium text-brand underline">{o.name}</Link>, o._count.members, o._count.products, o._count.orders, o.createdAt.toLocaleDateString("en-IN"), <Pill key="s" on={o.suspended} yes="Suspended" no="Active" />])} /></Shell>;
}
