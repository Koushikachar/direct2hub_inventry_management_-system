"use client";
import { gaId } from "@/lib/seo"; import { setConsent } from "@/lib/consent";
/** Footer link to change your mind during a visit. Only shown when analytics is configured. */
export default function CookieSettings() {
  if (!gaId()) return null;
  return <button type="button" className="underline" onClick={() => setConsent(null)}>Analytics choice</button>;
}
