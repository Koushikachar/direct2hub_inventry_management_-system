import { ctx } from "./ctx";
/** Shared guard for the Razorpay checkout routes: same-site request, signed-in OWNER. Returns the context or a ready-made error Response. */
export async function ownerOrError(req: Request) {
  const o = req.headers.get("origin"); if (o) { try { if (new URL(o).host !== req.headers.get("host")) return Response.json({ error: "Bad origin" }, { status: 403 }); } catch { return Response.json({ error: "Bad origin" }, { status: 403 }); } }
  let c: Awaited<ReturnType<typeof ctx>>; try { c = await ctx(); } catch { return Response.json({ error: "Sign in again to continue" }, { status: 401 }); }
  if (c.role !== "OWNER") return Response.json({ error: "Only the business owner can change the subscription" }, { status: 403 });
  return c;
}
