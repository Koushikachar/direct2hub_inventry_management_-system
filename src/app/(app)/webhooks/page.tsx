import SubmitButton from "@/components/SubmitButton"; import OptimisticToggle from "@/components/OptimisticToggle";
import { Shell } from "@/components/Shell"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { EVENTS, processDue } from "@/lib/webhooks";
import { createWebhook, toggleWebhook, deleteWebhook, rotateWebhookSecret, testWebhook, resendDelivery } from "@/app/actions";
export const dynamic = "force-dynamic";
const hid = (id: string) => <input type="hidden" name="id" value={id} />;
export default async function Webhooks({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const c = await ctx(), { e, ok } = await searchParams;
  if (c.role !== "OWNER") return <Shell title="Webhooks"><p className="glass p-6 text-sm text-ink/70">Only the organization owner can manage webhooks.</p></Shell>;
  await processDue(5).catch(() => 0); // catch up on any retries that are due
  const [hooks, ds] = await Promise.all([db.webhook.findMany({ where: { orgId: c.orgId }, orderBy: { createdAt: "desc" } }), db.webhookDelivery.findMany({ where: { orgId: c.orgId }, orderBy: { createdAt: "desc" }, take: 30, include: { webhook: { select: { url: true } } } })]);
  const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };
  return <Shell title="Webhooks"><Err e={e} />{ok && <p role="status" className="glass px-4 py-2 text-sm text-brand">{ok}</p>}
    <p className="text-sm text-ink/70">Send an HTTPS request to your own system whenever something happens here, so you can connect accounting, shipping or messaging tools. Each request is signed so you can check it came from Direct2Hub.</p>
    <Panel title="Add a webhook"><form action={createWebhook} className="space-y-3"><label className="block text-sm sm:max-w-xl">Endpoint URL<input name="url" type="url" required placeholder="https://example.com/hooks/direct2hub" className={inp} /></label>
      <fieldset><legend className="mb-1 text-sm">Events</legend><div className="grid gap-1 sm:grid-cols-2">{EVENTS.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name="events" value={k} defaultChecked />{l} <code className="text-xs text-ink/60">{k}</code></label>)}</div></fieldset>
      <SubmitButton className={btn}>Add webhook</SubmitButton><p className="text-xs text-ink/60">Only public https:// addresses are allowed. Private networks and internal hosts are blocked.</p></form></Panel>
    <Table head={["Endpoint","Events","Status","Actions"]} empty="No webhooks yet." rows={hooks.map(h => [<div key="u" className="min-w-0 break-all"><b>{host(h.url)}</b><div className="text-xs text-ink/60">{h.url}</div>
        <details className="mt-1 text-xs"><summary className="cursor-pointer text-brand">Show signing secret</summary><code className="mt-1 block break-all rounded bg-white/60 p-2">{h.secret}</code></details></div>,
      `${h.events.length} selected`, h.active ? (h.failures ? `Active (${h.failures} recent failures)` : "Active") : "Off",
      <div key="a" className="flex flex-wrap gap-2"><form action={testWebhook}>{hid(h.id)}<SubmitButton className={ghost}>Send test</SubmitButton></form><OptimisticToggle id={h.id} active={h.active} action={toggleWebhook} label={`Webhook ${h.url} is ${h.active ? "on" : "off"}`} />
        <form action={rotateWebhookSecret}>{hid(h.id)}<SubmitButton className={ghost}>New secret</SubmitButton></form><form action={deleteWebhook}>{hid(h.id)}<SubmitButton className={ghost}>Delete</SubmitButton></form></div>])} />
    <h2 className="font-semibold">Recent deliveries</h2>
    <Table head={["When","Event","Endpoint","Result","Tries",""]} empty="Nothing sent yet." rows={ds.map(d => [d.createdAt.toLocaleString("en-IN"), d.event, host(d.webhook.url), d.status === "SUCCESS" ? `Delivered (${d.responseCode})` : d.status === "PENDING" ? `Retrying${d.error ? `: ${d.error}` : ""}` : `Failed: ${d.error ?? "unknown"}`, d.attempts,
      d.status !== "SUCCESS" ? <form key="r" action={resendDelivery}>{hid(d.id)}<SubmitButton className={ghost}>Retry now</SubmitButton></form> : "—"])} />
    <Panel title="Verify a request (Node.js)"><pre className="overflow-x-auto rounded-xl bg-ink p-4 text-xs text-white">{`const ts = req.headers["x-d2h-timestamp"];
const expected = crypto.createHmac("sha256", SECRET)
  .update(ts + "." + rawBody).digest("hex");
const ok = req.headers["x-d2h-signature"] === "sha256=" + expected;
// also reject if |now - ts| > 5 minutes (replay protection)`}</pre>
      <p className="mt-2 text-xs text-ink/60">Answer with any 2xx status within 5 seconds. Otherwise we retry up to 5 times (1 min, 5 min, 30 min, 2 h, 12 h). Use the delivery id (X-D2H-Delivery) to ignore duplicates.</p></Panel></Shell>;
}
