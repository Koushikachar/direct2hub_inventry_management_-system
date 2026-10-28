import SubmitButton from "@/components/SubmitButton";
import { Shell } from "@/components/Shell"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { logReturn, inspectReturn } from "@/app/actions";
export const dynamic = "force-dynamic";
export default async function Returns({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const c = await ctx(), { e } = await searchParams;
  const [rs, ps] = await Promise.all([db.return.findMany({ where: { orgId: c.orgId }, orderBy: { createdAt: "desc" }, take: 50 }), db.product.findMany({ where: { orgId: c.orgId }, take: 500 })]);
  const nm = Object.fromEntries(ps.map(p => [p.id, p.name]));
  return <Shell title="Returns" active="Returns" admin={c.op}><Err e={e} />
    <Panel title="Log a return"><form action={logReturn} className="grid gap-3 sm:grid-cols-4"><label className="text-sm">Product<select name="productId" required className={inp}>{ps.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="text-sm">Quantity<input name="qty" type="number" min={1} defaultValue={1} className={inp} /></label><label className="text-sm">Reason<input name="reason" className={inp} /></label><div className="self-end"><SubmitButton className={btn}>Log return</SubmitButton></div></form></Panel>
    <Table head={["Product","Qty","Reason","Status","Inspection"]} empty="No returns logged." rows={rs.map(r => [nm[r.productId], r.qty, r.reason ?? "—", r.status,
      r.status === "PENDING" ? <form key="f" action={inspectReturn} className="flex gap-2"><input type="hidden" name="id" value={r.id} /><button name="d" value="RESTOCK" className={ghost}>Restock</button><button name="d" value="DAMAGED" className={ghost}>Mark damaged</button></form> : "Done"])} /></Shell>;
}
