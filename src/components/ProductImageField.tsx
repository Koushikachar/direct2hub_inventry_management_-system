"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { imgUrl } from "@/lib/imgurl";
const MAX = 1600, MAX_DATA = 150_000;
const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
/** Draws the picture smaller and re-encodes it as WebP. */
async function render(f: File, max: number, q: number): Promise<Blob | null> {
  const bmp = await createImageBitmap(f), k = Math.min(1, max / Math.max(bmp.width, bmp.height)), cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
  cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close?.();
  return new Promise<Blob | null>((r) => cv.toBlob(r, "image/webp", q));
}
/** Shrinks a phone photo (often 4-8 MB) to a web-sized WebP before it leaves the device: faster upload and far less storage used. */
async function shrink(f: File): Promise<File> {
  try {
    const blob = await render(f, MAX, 0.82); if (!blob) return f;
    return blob.size < f.size || f.size > 3_500_000 ? new File([blob], "product.webp", { type: blob.type }) : f;
  } catch { return f; }
}
/** With no image storage set up, the picture is made small enough (about 100 KB) to be kept with the product itself. */
async function tiny(f: File): Promise<string | null> {
  try { for (const [max, q] of [[640, 0.78], [480, 0.7], [360, 0.6], [260, 0.5]] as const) { const b = await render(f, max, q); if (!b) return null; const d = await toDataUrl(b); if (d.length <= MAX_DATA && d.startsWith("data:image/")) return d; } } catch {}
  return null;
}
/** Optional product picture. With a productId it saves at once (product page); without one it rides along with the surrounding form (Add product).
 *  "Upload" always works: with image storage (Cloudinary) the file is stored there; without it, a compressed copy is kept with the product. A picture link can be pasted instead. */
export default function ProductImageField({ productId, url, enabled, disabled }: { productId?: string; url?: string | null; enabled: boolean; disabled?: boolean }) {
  const router = useRouter(), input = useRef<HTMLInputElement>(null), [cur, setCur] = useState(url ?? null), [preview, setPreview] = useState<string | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [link, setLink] = useState(""), [data, setData] = useState("");
  const putUrl = async (u: string) => {
    const r = await fetch(`/api/products/${productId}/image`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u }) }).catch(() => null), j = await r?.json().catch(() => null);
    if (r?.ok) { setCur(j.url); setLink(""); router.refresh(); } else setErr(j?.error ?? "Couldn't save the picture");
  };
  const saveLink = async () => { setErr(""); if (!productId || !link) return; setBusy(true); await putUrl(link); setBusy(false); };
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return; setErr("");
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) { setErr("Choose a JPG, PNG or WebP picture"); e.target.value = ""; return; }
    setBusy(true);
    if (!enabled) { // no image storage: keep a small copy with the product
      const d = await tiny(f); e.target.value = "";
      if (!d) { setErr("That picture couldn't be read. Try a JPG, PNG or WebP."); setBusy(false); return; }
      if (productId) await putUrl(d); else { setData(d); setLink(""); setPreview(d); }
      setBusy(false); return;
    }
    const small = await shrink(f);
    if (small.size > 4_000_000) { setErr("That picture is too large. Try a smaller one."); setBusy(false); e.target.value = ""; return; }
    if (!productId) { const dt = new DataTransfer(); dt.items.add(small); if (input.current) input.current.files = dt.files; setPreview(URL.createObjectURL(small)); setBusy(false); return; }
    const fd = new FormData(); fd.set("image", small);
    const r = await fetch(`/api/products/${productId}/image`, { method: "POST", body: fd }).catch(() => null), j = await r?.json().catch(() => null);
    if (r?.ok) { setCur(j.url); router.refresh(); } else setErr(j?.error ?? "Upload failed"); setBusy(false); e.target.value = "";
  };
  const remove = async () => {
    if (!productId) { if (input.current) input.current.value = ""; setPreview(null); setData(""); setLink(""); return; }
    setBusy(true); const r = await fetch(`/api/products/${productId}/image`, { method: "DELETE" }).catch(() => null); if (r?.ok) { setCur(null); router.refresh(); } else setErr("Couldn't remove it"); setBusy(false);
  };
  const shown = preview ?? (!productId && link.startsWith("https://") ? link : imgUrl(cur, 480));
  return <div className="sm:col-span-full"><span className="text-sm">Picture <span className="text-ink/60">(optional)</span></span>
    <div className="mt-1 flex items-center gap-3">
      <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/70 bg-white/50 text-xs text-ink/50">{shown ? <img src={shown} alt="" width={80} height={80} className="h-full w-full object-cover" /> : "No picture"}</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`ghost-hit inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/70 bg-white/50 px-3 text-sm backdrop-blur transition hover:bg-white/80 ${disabled || busy ? "pointer-events-none opacity-60" : ""}`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>{busy ? "Working…" : shown ? "Change picture" : "Upload picture"}
          <input ref={input} type="file" name={productId || !enabled ? undefined : "image"} accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={pick} disabled={disabled || busy} className="sr-only" /></label>
        {shown && !disabled && <button type="button" onClick={remove} disabled={busy} className="ghost-hit min-h-10 rounded-xl px-3 text-sm text-danger hover:bg-danger/10">Remove</button>}</div></div>
    {!productId && data && <input type="hidden" name="imageUrl" value={data} />}
    {!disabled && <details className="mt-2 text-sm"><summary className="cursor-pointer text-brand underline">Or paste a picture link</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2"><input name={productId || data ? undefined : "imageUrl"} type="url" inputMode="url" maxLength={500} aria-label="Picture link" placeholder="https://example.com/photo.jpg" value={link} onChange={(e) => { setLink(e.target.value); if (!productId && e.target.value) { setData(""); setPreview(null); } }} className="min-h-10 min-w-0 flex-1 rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-sm" />
        {productId && <button type="button" onClick={saveLink} disabled={busy || !link} className="ghost-hit min-h-10 rounded-xl border border-white/70 bg-white/50 px-3 text-sm disabled:opacity-60">Save link</button>}</div></details>}
    {err && <p role="alert" className="mt-1 text-sm text-danger">{err}</p>}</div>;
}
