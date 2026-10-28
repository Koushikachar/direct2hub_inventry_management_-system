import { createHash } from "crypto";
/** 12+ characters and not found in known breaches (HaveIBeenPwned k-anonymity: only the first 5 hash characters leave the server). Fails open if the service is down. */
export async function checkPassword(pw: string): Promise<string | null> {
  if (pw.length < 12) return "Use at least 12 characters";
  if (pw.length > 128) return "Use at most 128 characters";
  if (/^(.)\1+$/.test(pw)) return "That password is too repetitive";
  try {
    const h = createHash("sha1").update(pw).digest("hex").toUpperCase();
    const r = await fetch(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(3000) });
    if (r.ok && (await r.text()).split("\n").some((l) => l.startsWith(h.slice(5)) && Number(l.split(":")[1]) > 0)) return "That password appears in known data breaches. Choose a different one";
  } catch { /* service unavailable: don't block signup */ }
  return null;
}
