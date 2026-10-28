import { z } from "zod"; import { apiAuth } from "@/lib/apikeys"; import { describeProduct, AiError, aiReady, NOT_SET } from "@/lib/ai";
export const maxDuration = 30;
const body = z.object({ name: z.string().trim().min(1).max(120), sku: z.string().trim().max(64).optional(), unit: z.string().trim().max(12).optional(), notes: z.string().trim().max(600).optional(), language: z.enum(["en", "hi", "kn"]).default("en") });
/** POST /api/v1/ai/describe  {"name":"Cotton cap","notes":"adjustable, navy","language":"en"}  ->  {"description":"..."} */
export async function POST(req: Request) {
  const a = await apiAuth(req); if (a instanceof Response) return a; if (!aiReady()) return Response.json({ error: NOT_SET }, { status: 503 });
  const b = body.safeParse(await req.json().catch(() => null)); if (!b.success) return Response.json({ error: "Send JSON with a name (and optional sku, unit, notes, language: en|hi|kn)" }, { status: 400 });
  try { return Response.json({ description: await describeProduct(b.data) }); } catch (e) { return e instanceof AiError ? Response.json({ error: e.message }, { status: e.status }) : Response.json({ error: "Something went wrong" }, { status: 500 }); }
}
