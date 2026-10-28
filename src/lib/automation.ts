import { db } from "./db"; import { sendMail } from "./mail"; import { matches, render } from "./rules";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Runs every active rule for this event whose condition matches. Failures never affect the action that triggered them. */
export async function runAutomations(orgId: string, event: string, data: unknown) {
  const d = (data ?? {}) as Record<string, unknown>, rules = await db.automation.findMany({ where: { orgId, event, active: true } });
  for (const r of rules) {
    if (!matches(d, r.field, r.op, r.value)) continue; const text = render(r.template, d);
    if (r.action === "NOTIFY") await db.notification.create({ data: { orgId, kind: "automation", title: r.name, body: text.slice(0, 300) } });
    else if (r.action === "EMAIL" && r.target) {
      if ((await db.auditLog.count({ where: { orgId, action: "automation.email", createdAt: { gt: new Date(Date.now() - 3600_000) } } })) >= 30) continue; // at most 30 automated emails per hour
      const m = await sendMail({ to: r.target, subject: `[Direct2Hub] ${r.name}`, html: `<p>${esc(text)}</p>` });
      await db.auditLog.create({ data: { orgId, actorId: "automation", action: "automation.email", detail: { rule: r.id, ok: m.ok } } });
    }
    await db.automation.update({ where: { id: r.id }, data: { runs: { increment: 1 }, lastRunAt: new Date() } });
  }
}
