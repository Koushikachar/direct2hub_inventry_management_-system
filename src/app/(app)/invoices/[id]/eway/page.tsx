import SubmitButton from "@/components/SubmitButton";
import Link from "next/link"; import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell"; import { Panel, inp, btn } from "@/components/ui";
import { ctx } from "@/lib/ctx"; import { ewayFor } from "@/lib/eway-server"; import { invNo, inr } from "@/lib/gst"; import { EWAY_THRESHOLD } from "@/lib/eway";
export const dynamic = "force-dynamic";
export default async function Eway({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const c = await ctx(), { id } = await params, sp = await searchParams, go = sp.go === "1", f = await ewayFor(c.orgId, id, sp); if (!f) return notFound();
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "go" && v) as [string, string][]).toString();
  return <Shell title={`E-way bill · ${invNo(f.inv.number)}`}><Link href={`/invoices/${id}`} className="text-sm text-brand underline">← Invoice</Link>
    <p className={`rounded-xl px-4 py-3 text-sm ${f.required ? "bg-turmeric/20" : "bg-white/60"}`}>{f.required ? `This invoice is above ${inr(EWAY_THRESHOLD)}, so an e-way bill is normally needed before the goods move.` : `This invoice is ${inr(EWAY_THRESHOLD)} or less. An e-way bill is usually not needed for a single invoice at this value (state rules and goods type can differ).`}</p>
    <Panel title="Transport details"><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="go" value="1" />
      <label className="text-sm">From: town / city<input name="fromPlace" required defaultValue={sp.fromPlace ?? ""} className={inp} /></label><label className="text-sm">From: pincode<input name="fromPin" required inputMode="numeric" maxLength={6} defaultValue={sp.fromPin ?? ""} className={inp} /></label>
      <label className="text-sm">To: town / city<input name="toPlace" required defaultValue={sp.toPlace ?? ""} className={inp} /></label><label className="text-sm">To: pincode<input name="toPin" required inputMode="numeric" maxLength={6} defaultValue={sp.toPin ?? ""} className={inp} /></label>
      <label className="text-sm">Mode<select name="mode" defaultValue={sp.mode ?? "1"} className={inp}><option value="1">Road</option><option value="2">Rail</option><option value="3">Air</option><option value="4">Ship</option></select></label>
      <label className="text-sm">Distance (km, 0 = portal works it out)<input name="distance" type="number" min={0} max={4000} defaultValue={sp.distance ?? "0"} className={inp} /></label>
      <label className="text-sm">Vehicle number<input name="vehicle" placeholder="KA01AB1234" defaultValue={sp.vehicle ?? ""} className={inp} /></label><label className="text-sm">Transporter ID (GSTIN, optional)<input name="transporterId" maxLength={15} defaultValue={sp.transporterId ?? ""} className={inp} /></label>
      <label className="text-sm">Transporter name<input name="transporterName" defaultValue={sp.transporterName ?? ""} className={inp} /></label><label className="text-sm">Transport doc / LR no.<input name="docNo" maxLength={20} defaultValue={sp.docNo ?? ""} className={inp} /></label><label className="text-sm">Transport doc date<input name="docDate" type="date" defaultValue={sp.docDate ?? ""} className={inp} /></label>
      <div className="self-end"><SubmitButton className={btn}>Check and prepare</SubmitButton></div></form></Panel>
    {go && (f.result.ok ? <Panel title="Ready to upload"><p className="text-sm">The file is ready for <b>{invNo(f.inv.number)}</b> · {inr(Number(f.inv.total))}.</p>
      <a href={`/api/invoices/${id}/eway?${qs}`} className={`${btn} mt-3 inline-flex items-center`}>Download e-way bill JSON</a>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-ink/70"><li>Sign in at ewaybillgst.gov.in with your GST login.</li><li>Open E-Way Bill → Generate Bulk, and upload the file.</li><li>Download the e-way bill numbers from the portal and save the number on the invoice page.</li></ol>
      <p className="mt-3 text-xs text-ink/60">Direct2Hub does not connect to the GST portal. The file follows the portal's bulk-upload layout; if the portal rejects it, the error it shows names the field to fix, and you can always enter the same details by hand.</p></Panel>
      : <Panel title="Fix these first"><ul className="list-disc space-y-1 pl-5 text-sm text-danger">{f.result.errors.map((x) => <li key={x}>{x}</li>)}</ul></Panel>)}</Shell>;
}
