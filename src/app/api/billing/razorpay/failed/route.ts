import { z } from "zod";
import { db } from "@/lib/db"; import { ownerOrError } from "@/lib/rzauth"; import { allow } from "@/lib/ratelimit"; import { explainPayError } from "@/lib/payerrors";
export const dynamic = "force-dynamic";
/** The checkout window reported a failed attempt. We keep a short, friendly reason on the payment so it shows in the history. The payment stays open, because Razorpay lets the customer retry the same order. */
export async function POST(req: Request) {
  const c = await ownerOrError(req); if (c instanceof Response) return c;
  if (!(await allow(`rzp-failed:${c.orgId}`, 60, 3600_000))) return Response.json({ ok: true });
  const b = z.object({ paymentId: z.string().min(5).max(40), error: z.any().optional() }).safeParse(await req.json().catch(() => null)); if (!b.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const info = explainPayError(b.data.error);
  await db.subscriptionPayment.updateMany({ where: { id: b.data.paymentId, orgId: c.orgId, status: "PENDING", method: { in: ["RAZORPAY", "RAZORPAY_AUTO"] } }, data: { note: info.title.slice(0, 200) } });
  return Response.json({ ok: true, kind: info.kind });
}
