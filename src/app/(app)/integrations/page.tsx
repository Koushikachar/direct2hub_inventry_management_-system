import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { Shell } from "@/components/Shell"; import ApiKeyForm from "@/components/ApiKeyForm"; import { Err, Panel, Table, inp, btn, ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { revokeApiKey, addCarrier, deleteCarrier, saveShopify, deleteConnection, syncShopifyNow } from "@/app/actions"; import { encryptionReady } from "@/lib/secrets";
export const dynamic = "force-dynamic";
export default async function Integrations({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const c = await ctx(), { e } = await searchParams;
  if (c.role !== "OWNER") return <Shell title="Integrations"><p className="glass p-6 text-sm text-ink/70">Only the organization owner can manage integrations.</p></Shell>;
  const [keys, cars, conns] = await Promise.all([db.apiKey.findMany({ where: { orgId: c.orgId }, orderBy: { createdAt: "desc" } }), db.carrier.findMany({ where: { orgId: c.orgId }, orderBy: { name: "asc" } }), db.connection.findMany({ where: { orgId: c.orgId } })]);
  const sh = conns.find(x => x.provider === "SHOPIFY"), key = encryptionReady();;
  return <Shell title="Integrations"><Err e={e} />
    <p className="text-sm text-ink/70">Connect marketplaces, couriers and other tools. Use the API to push orders in and read stock and order status out, and <Link href="/webhooks" className="text-brand underline">webhooks</Link> to be told when things change. Marketplace connectors such as Amazon or Flipkart need their own accounts, so connect them through a tool like Zapier or n8n, or your own script, using this API.</p>
    <Panel title="Store account"><p className="mb-3 text-sm text-ink/70">Passwords and tokens are stored encrypted and are never shown again. {!key && <b className="text-danger">Set APP_ENC_KEY on the server to enable this section.</b>}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass p-4"><h3 className="font-semibold">Shopify {sh && <span className="text-xs font-normal text-brand">connected: {(sh.config as any).shop}</span>}</h3><p className="mt-1 text-xs text-ink/60">Imports open orders as drafts when every line's SKU matches a product here and the order is in rupees. Use a custom app's Admin API token with read access to orders.</p>
          {sh?.lastSyncAt && <p className="mt-1 text-xs text-ink/60">Last sync {sh.lastSyncAt.toLocaleString("en-IN")}{sh.lastError ? ` · ${sh.lastError}` : ""}</p>}
          <form action={saveShopify} className="mt-3 space-y-2"><input name="shop" required placeholder="mystore.myshopify.com" aria-label="Store address" disabled={!key} className={inp} /><input name="token" type="password" required placeholder="Admin API access token" aria-label="Access token" autoComplete="off" disabled={!key} className={inp} /><button className={btn} disabled={!key}>{sh ? "Replace connection" : "Connect Shopify"}</button></form>
          {sh && <div className="mt-2 flex gap-2"><form action={syncShopifyNow}><SubmitButton className={ghost}>Sync now</SubmitButton></form><form action={deleteConnection}><input type="hidden" name="provider" value="SHOPIFY" /><SubmitButton className={ghost}>Disconnect</SubmitButton></form></div>}</div>
        </div></Panel>
    <Panel title="API keys"><ApiKeyForm />
      <div className="mt-4"><Table head={["Name","Key","Last used","Status"]} empty="No keys yet." rows={keys.map(k => [k.name, `d2h_live_${k.prefix}_…`, k.lastUsedAt?.toLocaleString("en-IN") ?? "Never", k.revokedAt ? "Revoked" : <form key="r" action={revokeApiKey} className="flex items-center gap-2"><span>Active</span><input type="hidden" name="id" value={k.id} /><SubmitButton className={ghost}>Revoke</SubmitButton></form>])} /></div></Panel>
    <Panel title="Using the API"><pre className="overflow-x-auto rounded-xl bg-ink p-4 text-xs text-white">{`# stock levels (all products, or one SKU)
curl -H "Authorization: Bearer YOUR_KEY" "https://YOUR-SITE/api/v1/stock?sku=TEE-M"

# create a draft order (safe to retry: externalRef is unique)
curl -X POST -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" \\
  -d '{"externalRef":"AMZ-123","customer":"Asha","lines":[{"sku":"TEE-M","qty":2}]}' \\
  https://YOUR-SITE/api/v1/orders

# order status and tracking
curl -H "Authorization: Bearer YOUR_KEY" "https://YOUR-SITE/api/v1/orders?externalRef=AMZ-123"`}</pre>
      <p className="mt-2 text-xs text-ink/60">Orders arrive as drafts; confirm them here so stock is reserved with all the usual checks. Limit: 60 requests per minute per key. Keep keys secret.</p></Panel>
    <Panel title="Courier tracking links"><p className="mb-3 text-sm text-ink/70">Enter the courier and tracking number on an order after dispatch and you get a "Track shipment" link. Delhivery works out of the box. Add any other courier with its tracking page address, using {"{awb}"} where the number goes.</p>
      <form action={addCarrier} className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Courier name<input name="name" required placeholder="DTDC" className={inp} /></label><label className="text-sm sm:col-span-2">Tracking URL<input name="trackUrl" required placeholder="https://example.com/track?no={awb}" className={inp} /></label><div><SubmitButton className={btn}>Save courier</SubmitButton></div></form>
      {cars.length > 0 && <ul className="mt-3 divide-y divide-white/70 text-sm">{cars.map(x => <li key={x.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 break-all"><b>{x.name}</b> <span className="text-xs text-ink/60">{x.trackUrl}</span></span><form action={deleteCarrier}><input type="hidden" name="id" value={x.id} /><SubmitButton className={ghost}>Remove</SubmitButton></form></li>)}</ul>}</Panel></Shell>;
}
