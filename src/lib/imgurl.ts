/** Safe to import from browser code (no Node modules). */
/** A size-matched, auto-format (AVIF/WebP where the browser can) and auto-quality copy of a stored picture. Other hosts are returned as they are. */
export function imgUrl(url: string | null | undefined, w = 400) {
  if (!url) return null; try { const u = new URL(url); if (u.hostname !== "res.cloudinary.com") return url; return url.replace("/upload/", `/upload/f_auto,q_auto,c_limit,w_${w}/`); } catch { return null; }
}
