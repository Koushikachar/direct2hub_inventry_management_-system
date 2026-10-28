import { revalidatePath } from "next/cache";
import { db } from "@/lib/db"; import { ctx } from "@/lib/ctx"; import { allow } from "@/lib/ratelimit"; import { uploadImage, deleteImage, imagesReady, MAX_IMAGE } from "@/lib/images";
export const dynamic = "force-dynamic";
const CAN = ["OWNER", "INVENTORY_MANAGER"];
async function who() { try { const c = await ctx(); return CAN.includes(c.role) ? c : null; } catch { return null; } }
/** POST multipart "image": replaces the product's picture. DELETE: removes it. Only the owner and inventory managers of the product's own organization. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await who(); if (!c) return Response.json({ error: "Not allowed" }, { status: 403 });
  if (!imagesReady()) return Response.json({ error: "Image storage isn't set up yet" }, { status: 503 });
  if (!(await allow(`img:${c.orgId}`, 30, 60_000))) return Response.json({ error: "Too many uploads. Wait a minute." }, { status: 429 });
  const { id } = await params, p = await db.product.findFirst({ where: { id, orgId: c.orgId }, select: { id: true, imageId: true } }); if (!p) return Response.json({ error: "Product not found" }, { status: 404 });
  const f = (await req.formData().catch(() => null))?.get("image"); if (!(f instanceof File) || !f.size) return Response.json({ error: "Choose a picture" }, { status: 400 });
  if (f.size > MAX_IMAGE) return Response.json({ error: "That picture is over 4 MB" }, { status: 413 });
  try { const up = await uploadImage(f, c.orgId); await db.product.updateMany({ where: { id, orgId: c.orgId }, data: { imageUrl: up.url, imageId: up.id } }); await deleteImage(p.imageId, c.orgId); revalidatePath("/products"); revalidatePath(`/products/${id}`); return Response.json({ url: up.url }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 }); }
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await who(); if (!c) return Response.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params, p = await db.product.findFirst({ where: { id, orgId: c.orgId }, select: { imageId: true } }); if (!p) return Response.json({ error: "Product not found" }, { status: 404 });
  await db.product.updateMany({ where: { id, orgId: c.orgId }, data: { imageUrl: null, imageId: null } }); await deleteImage(p.imageId, c.orgId); revalidatePath("/products"); revalidatePath(`/products/${id}`); return Response.json({ ok: true });
}
/** PUT {"url": "https://..." or a small data-URL image}: saves a picture when image storage isn't set up. Same permissions as POST. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await who(); if (!c) return Response.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params, j = (await req.json().catch(() => null)) as { url?: string } | null, v = String(j?.url ?? "").trim(); let url: string | null = null;
  if (v.startsWith("data:")) { if (v.length <= 150_000 && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(v)) url = v; else return Response.json({ error: "That picture is too large. Try a smaller one." }, { status: 413 }); }
  else { try { const u = new URL(v); if (u.protocol === "https:" && v.length <= 500) url = u.toString(); } catch {} if (!url) return Response.json({ error: "The link must start with https://" }, { status: 400 }); }
  const p = await db.product.findFirst({ where: { id, orgId: c.orgId }, select: { imageId: true } }); if (!p) return Response.json({ error: "Product not found" }, { status: 404 });
  await db.product.updateMany({ where: { id, orgId: c.orgId }, data: { imageUrl: url, imageId: null } }); await deleteImage(p.imageId, c.orgId);
  revalidatePath("/products"); revalidatePath(`/products/${id}`); return Response.json({ url });
}
