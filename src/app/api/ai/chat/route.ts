import { z } from "zod"; import { ctx } from "@/lib/ctx"; import { allow } from "@/lib/ratelimit"; import { AiError, aiReady, NOT_SET } from "@/lib/ai"; import { runChat } from "@/lib/aitools";
export const dynamic = "force-dynamic"; export const maxDuration = 60;
const body = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).min(1).max(40) });
/** The assistant. Answers come from tools that only read the signed-in organization's own data. */
export async function POST(req: Request) {
  let c: Awaited<ReturnType<typeof ctx>>; try { c = await ctx(); } catch { return Response.json({ error: "Sign in first" }, { status: 401 }); }
  if (!aiReady()) return Response.json({ error: NOT_SET }, { status: 503 });
  const b = body.safeParse(await req.json().catch(() => null)); if (!b.success || b.data.messages.at(-1)?.role !== "user") return Response.json({ error: "Ask a question" }, { status: 400 });
  if (!(await allow(`ai:${c.orgId}`, 20, 60_000))) return Response.json({ error: "Too many questions. Wait a minute." }, { status: 429 });
  try { return Response.json({ reply: await runChat({ orgId: c.orgId, orgName: c.orgName, finance: ["OWNER", "ACCOUNTANT", "ANALYST"].includes(c.role) }, b.data.messages.slice(-12)) }); }
  catch (e) { return e instanceof AiError ? Response.json({ error: e.message }, { status: e.status }) : Response.json({ error: "Something went wrong" }, { status: 500 }); }
}
