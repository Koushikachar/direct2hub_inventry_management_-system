import { z } from "zod"; import { ctx } from "@/lib/ctx"; import { allow } from "@/lib/ratelimit"; import { describeProduct, AiError, aiReady, NOT_SET } from "@/lib/ai";
export const dynamic = "force-dynamic"; export const maxDuration = 30;
const body = z.object({ name: z.string().trim().min(1).max(120), sku: z.string().trim().max(64).optional(), unit: z.string().trim().max(12).optional(), notes: z.string().trim().max(600).optional(), language: z.enum(["en", "hi", "kn"]).default("en") });
/** Product description writer for the signed-in app (the "Write with AI" button). */
export async function POST(req: Request) {
  let c: Awaited<ReturnType<typeof ctx>>; try { c = await ctx(); } catch { return Response.json({ error: "Sign in first" }, { status: 401 }); }
  if (!aiReady()) return Response.json({ error: NOT_SET }, { status: 503 });
  const b = body.safeParse(await req.json().catch(() => null)); if (!b.success) return Response.json({ error: "Enter the product name first" }, { status: 400 });
  if (!(await allow(`ai:${c.orgId}`, 20, 60_000))) return Response.json({ error: "Too many AI requests. Wait a minute." }, { status: 429 });
  try { return Response.json({ description: await describeProduct(b.data) }); } catch (e) { return e instanceof AiError ? Response.json({ error: e.message }, { status: e.status }) : Response.json({ error: "Something went wrong" }, { status: 500 }); }
}
