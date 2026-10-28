import SubmitButton from "@/components/SubmitButton";
import { Shell, Stat } from "@/components/Shell"; import AdminTabs from "@/components/AdminTabs"; import { ghost } from "@/components/ui";
import { db } from "@/lib/db"; import { adminGuard } from "@/lib/admin"; import { markMessageHandled } from "../actions";
export const dynamic = "force-dynamic";
/** Everything sent through the public contact form, newest first. Messages are saved even when email delivery isn't set up. */
export default async function Messages() {
  await adminGuard(); const [rows, open] = await Promise.all([db.contactMessage.findMany({ orderBy: [{ handled: "asc" }, { createdAt: "desc" }], take: 100 }), db.contactMessage.count({ where: { handled: false } })]);
  return <Shell title="Platform admin"><AdminTabs current="Messages" /><div className="grid gap-4 sm:grid-cols-2"><Stat label="Waiting for a reply" value={open} tone={open ? "warn" : "brand"} /><Stat label="Shown" value={rows.length} hint="Latest 100" /></div>
    {rows.length === 0 ? <p className="glass p-5 text-sm text-ink/70">No messages yet.</p> : <ul className="space-y-3">{rows.map((m) => <li key={m.id} className={`glass p-4 ${m.handled ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{m.name} <span className="font-normal text-ink/60">· <a href={`mailto:${m.email}`} className="text-brand underline">{m.email}</a>{m.phone ? ` · ${m.phone}` : ""}</span></p><p className="text-xs text-ink/60">{m.createdAt.toLocaleString("en-IN")} · {m.emailed ? "emailed to you" : "not emailed (read it here)"}</p></div>
        <form action={markMessageHandled}><input type="hidden" name="id" value={m.id} />{m.handled && <input type="hidden" name="undo" value="1" />}<SubmitButton className={ghost}>{m.handled ? "Mark as open" : "Mark as replied"}</SubmitButton></form></div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{m.message}</p></li>)}</ul>}</Shell>;
}
