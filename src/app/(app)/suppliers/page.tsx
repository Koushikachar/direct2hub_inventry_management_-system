import SubmitButton from "@/components/SubmitButton";
import { Shell } from "@/components/Shell"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { addSupplier } from "@/app/actions";
export const dynamic = "force-dynamic";
export default async function Suppliers({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const c = await ctx(), { e } = await searchParams, ss = await db.supplier.findMany({ where: { orgId: c.orgId }, orderBy: { name: "asc" }, take: 200 });
  return <Shell title="Suppliers" active="Suppliers" admin={c.op}><Err e={e} />
    <a href="/suppliers/import" className={`${ghost} inline-flex items-center`}>Import CSV</a>
    <Panel title="Add supplier"><form action={addSupplier} className="grid gap-3 sm:grid-cols-4">
      {["name","phone","email"].map(n => <label key={n} className="text-sm capitalize">{n}<input name={n} required={n === "name"} className={inp} /></label>)}<div className="self-end"><SubmitButton className={btn}>Save supplier</SubmitButton></div></form></Panel>
    <Table head={["Name","Phone","Email"]} empty="No suppliers yet. Add one above." rows={ss.map(s => [s.name, s.phone ?? "—", s.email ?? "—"])} /></Shell>;
}
