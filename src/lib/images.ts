import { createHash } from "crypto";
/** Product pictures live on Cloudinary's free plan (about 25 GB of storage/bandwidth credits, no card needed), not in your database or on the web server.
 *  Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET. Without them the image field is simply hidden. */
const cfg = () => { const e = process.env; return e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET ? { cloud: e.CLOUDINARY_CLOUD_NAME, key: e.CLOUDINARY_API_KEY, secret: e.CLOUDINARY_API_SECRET } : null; };
export const imagesReady = () => cfg() !== null;
export const MAX_IMAGE = 4 * 1024 * 1024; // stays under the 4.5 MB request limit on Vercel
/** Checks the real file signature, not the file name or the type the browser claims. */
export function sniff(b: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}
const sign = (p: Record<string, string>, secret: string) => createHash("sha1").update(Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join("&") + secret).digest("hex");
export async function uploadImage(file: File, orgId: string): Promise<{ url: string; id: string }> {
  const c = cfg(); if (!c) throw new Error("Image storage isn't set up");
  const bytes = new Uint8Array(await file.arrayBuffer()), kind = sniff(bytes);
  if (!kind) throw new Error("Use a JPG, PNG or WebP picture"); if (bytes.length > MAX_IMAGE) throw new Error("That picture is over 4 MB");
  const timestamp = String(Math.floor(Date.now() / 1000)), folder = `direct2hub/${orgId}`, signed = { folder, timestamp };
  const fd = new FormData(); fd.set("file", new Blob([bytes], { type: `image/${kind}` }), `product.${kind}`); fd.set("api_key", c.key); fd.set("timestamp", timestamp); fd.set("folder", folder); fd.set("signature", sign(signed, c.secret));
  const r = await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/image/upload`, { method: "POST", body: fd, signal: AbortSignal.timeout(25_000) });
  const j = (await r.json().catch(() => null)) as { secure_url?: string; public_id?: string } | null;
  if (!r.ok || !j?.secure_url || !j.public_id) throw new Error("The picture couldn't be saved. Please try again.");
  return { url: j.secure_url, id: j.public_id };
}
/** Best effort: a leftover picture is harmless, so a failed delete never blocks the person. */
export async function deleteImage(id: string | null | undefined, orgId: string) {
  const c = cfg(); if (!c || !id || !id.startsWith(`direct2hub/${orgId}/`)) return;
  const timestamp = String(Math.floor(Date.now() / 1000)), fd = new FormData(); fd.set("public_id", id); fd.set("api_key", c.key); fd.set("timestamp", timestamp); fd.set("signature", sign({ public_id: id, timestamp }, c.secret));
  await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/image/destroy`, { method: "POST", body: fd, signal: AbortSignal.timeout(10_000) }).catch(() => {});
}
export { imgUrl } from "./imgurl";
