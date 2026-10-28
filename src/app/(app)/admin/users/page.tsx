import SubmitButton from "@/components/SubmitButton";
import { Shell } from "@/components/Shell"; import AdminTabs from "@/components/AdminTabs"; import { Table, inp, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { adminGuard } from "@/lib/admin";
export const dynamic = "force-dynamic";
export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await adminGuard(); const { q } = await searchParams;
  const us = await db.user.findMany({ where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}, orderBy: { createdAt: "desc" }, take: 100, include: { memberships: { include: { org: true } } } });
  return <Shell title="Users" active="Admin" admin><AdminTabs current="Users" />
    <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search email or name" aria-label="Search users" className={inp} /><SubmitButton className={ghost}>Search</SubmitButton></form>
    <Table head={["Email","Name","Organizations","Joined"]} empty="No users match." rows={us.map(u => [u.email, u.name ?? "—", u.memberships.filter(m => m.orgId !== "platform").map(m => `${m.org.name} (${m.role})`).join(", ") || "—", u.createdAt.toLocaleDateString("en-IN")])} /></Shell>;
}
