import { z } from "zod"; import { db } from "@/lib/db"; import { apiAuth } from "@/lib/apikeys"; import { AiError, aiReady, NOT_SET } from "@/lib/ai"; import { runChat } from "@/lib/aitools";
export const maxDuration = 60;
/** POST /api/v1/ai/ask  {"question":"Which products are low on stock?"}  ->  {"answer":"..."}  Products, stock, orders, customers and suppliers only (no invoice or money-owed data). */
export async function POST(req: Request) {
  const a = await apiAuth(req); if (a instanceof Response) return a; if (!aiReady()) return Response.json({ error: NOT_SET }, { status: 503 });
  const b = z.object({ question: z.string().trim().min(1).max(1000) }).safeParse(await req.json().catch(() => null)); if (!b.success) return Response.json({ error: 'Send JSON like {"question":"..."}' }, { status: 400 });
  const o = await db.organization.findUnique({ where: { id: a.orgId }, select: { name: true } });
  try { return Response.json({ answer: await runChat({ orgId: a.orgId, orgName: o?.name ?? "your business", finance: false }, [{ role: "user", content: b.data.question }]) }); }
  catch (e) { return e instanceof AiError ? Response.json({ error: e.message }, { status: e.status }) : Response.json({ error: "Something went wrong" }, { status: 500 }); }
}
