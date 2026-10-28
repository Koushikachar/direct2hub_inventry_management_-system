import SubmitButton from "@/components/SubmitButton";
import { Shell } from "@/components/Shell"; import { ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { readNotification, readAll } from "@/app/actions";
export const dynamic = "force-dynamic";
export default async function Notifications() {
  const c = await ctx(), ns = await db.notification.findMany({ where: { orgId: c.orgId }, orderBy: { createdAt: "desc" }, take: 50 });
  return <Shell title="Notifications" active="Notifications" admin={c.op}>
    {ns.some(n => !n.readAt) && <form action={readAll}><SubmitButton className={ghost}>Mark all as read</SubmitButton></form>}
    {ns.length === 0 ? <p className="glass p-6 text-center text-sm text-ink/60">Nothing yet. You'll see low-stock alerts, rejected deliveries and finished imports here.</p> :
      <ul className="space-y-2">{ns.map(n => <li key={n.id}><form action={readNotification}><input type="hidden" name="id" value={n.id} />
        <SubmitButton className={`glass flex w-full items-start gap-3 p-4 text-left transition hover:bg-white/70 ${n.readAt ? "opacity-70" : ""}`}>
          <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-ink/20" : "bg-turmeric"}`} />
          <span className="min-w-0"><span className="block font-medium">{n.title}{!n.readAt && <span className="sr-only"> (unread)</span>}</span>{n.body && <span className="block text-sm text-ink/70">{n.body}</span>}
            <span className="mt-1 block text-xs text-ink/60">{n.createdAt.toLocaleString("en-IN")}</span></span></SubmitButton></form></li>)}</ul>}</Shell>;
}
