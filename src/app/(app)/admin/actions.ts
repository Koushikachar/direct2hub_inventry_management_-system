"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db"; import { adminGuard } from "@/lib/admin"; import { activatePayment } from "@/lib/billing-server";
/** Suspending locks every member of the org out until reactivated. Always audited, with a reason. */
export async function setSuspended(fd: FormData) {
  const op = await adminGuard(), id = String(fd.get("id")), suspend = fd.get("suspend") === "1", reason = String(fd.get("reason") ?? "").trim().slice(0, 300);
  const back = (q: string) => redirect(`/admin/orgs/${id}?${q}`);
  if (id === "platform") back("e=" + encodeURIComponent("The platform organization can't be suspended"));
  if (suspend && reason.length < 3) back("e=" + encodeURIComponent("Give a reason (at least 3 characters)"));
  await db.$transaction([db.organization.update({ where: { id }, data: { suspended: suspend } }),
    db.auditLog.create({ data: { orgId: id, actorId: op.id, action: suspend ? "org.suspended" : "org.reactivated", detail: { reason } } })]);
  revalidatePath("/admin"); back("ok=" + encodeURIComponent(suspend ? "Organization suspended" : "Organization reactivated"));
}

export async function setPlan(fd: FormData) {
  const op = await adminGuard(), id = String(fd.get("id")), plan = String(fd.get("plan")), back = (k: "e" | "ok", m: string) => redirect(`/admin/orgs/${id}?${k}=${encodeURIComponent(m)}`);
  if (!["FREE", "GROWTH", "SCALE"].includes(plan)) return back("e", "Unknown plan");
  const sub = await db.subscription.findUnique({ where: { orgId: id } });
  if (sub?.autoRenew && sub.status !== "EXPIRED" && sub.status !== "CANCELLED") return back("e", "This organization has an auto-renewing card subscription. Ask them to cancel it first, or the next charge would override your change.");
  // A hand-set plan is a grant: drop the paid-subscription row so it doesn't expire the plan you just chose.
  await db.$transaction([...(sub ? [db.subscription.delete({ where: { id: sub.id } })] : []), db.organization.update({ where: { id }, data: { plan } }), db.auditLog.create({ data: { orgId: id, actorId: op.id, action: "org.plan_changed", detail: { plan, hadSubscription: !!sub } } })]);
  revalidatePath(`/admin/orgs/${id}`); back("ok", "Plan updated");
}

/** UPI / bank payments are matched by hand against the bank statement. Approving switches the plan on; both outcomes are audited and the customer is notified. */
export async function reviewPayment(fd: FormData) {
  const op = await adminGuard(), id = String(fd.get("id")), approve = fd.get("d") === "approve", note = String(fd.get("note") ?? "").trim().slice(0, 200), back = (q: string) => redirect(`/admin/subscriptions?${q}`);
  const p = await db.subscriptionPayment.findFirst({ where: { id, status: "PENDING", method: { in: ["UPI", "BANK"] } } });
  if (!p) return back("e=" + encodeURIComponent("That payment is no longer pending"));
  if (!p.reference) return back("e=" + encodeURIComponent("The customer hasn't submitted a reference yet"));
  if (approve) {
    const r = await activatePayment(id); await db.auditLog.create({ data: { orgId: p.orgId, actorId: op.id, action: "subscription.payment_approved", detail: { payment: id, reference: p.reference, activated: r.activated } } });
    return back("ok=" + encodeURIComponent("Approved. The plan is active."));
  }
  if (note.length < 3) return back("e=" + encodeURIComponent("Give a reason (shown to the customer)"));
  await db.$transaction([db.subscriptionPayment.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", note } }),
    db.notification.create({ data: { orgId: p.orgId, kind: "billing", title: "Payment couldn't be verified", body: note, href: "/subscription" } }),
    db.auditLog.create({ data: { orgId: p.orgId, actorId: op.id, action: "subscription.payment_rejected", detail: { payment: id, reason: note } } })]);
  revalidatePath("/admin/subscriptions"); back("ok=" + encodeURIComponent("Rejected. The customer has been notified."));
}

export async function markMessageHandled(fd: FormData) {
  await adminGuard(); const id = String(fd.get("id")), handled = fd.get("undo") !== "1";
  await db.contactMessage.updateMany({ where: { id }, data: { handled } }); revalidatePath("/admin/messages"); redirect("/admin/messages");
}
