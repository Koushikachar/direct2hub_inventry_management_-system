import { ctx } from "@/lib/ctx"; import { ewayFor } from "@/lib/eway-server"; import { invNo } from "@/lib/gst";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx(), { id } = await params, f = await ewayFor(c.orgId, id, Object.fromEntries(new URL(req.url).searchParams));
  if (!f) return new Response("Not found", { status: 404 }); if (!f.result.ok) return new Response(f.result.errors.join("\n"), { status: 400 });
  return new Response(f.result.json, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename=eway-${invNo(f.inv.number)}.json`, "cache-control": "no-store" } });
}
