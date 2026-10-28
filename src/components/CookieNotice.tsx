"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { gaId } from "@/lib/seo"; import { getConsent, setConsent, subscribe } from "@/lib/consent";
/** Shown only when Google Analytics is configured (NEXT_PUBLIC_GA_ID). It asks on every visit and remembers nothing in the browser: the answer is held in memory until the page is reloaded. With analytics off there is nothing to ask, so nothing is shown (only essential sign-in cookies are used). */
export default function CookieNotice() {
  const choice = useSyncExternalStore(subscribe, getConsent, () => null);
  if (!gaId() || choice !== null) return null;
  const btn = "min-h-10 rounded-xl bg-white/15 px-4 py-2 font-semibold transition hover:bg-white/25";
  return <div role="region" aria-label="Analytics choice" className="glass-dark fixed inset-x-3 bottom-24 z-40 flex flex-wrap items-center justify-between gap-3 p-4 text-sm md:inset-x-auto md:bottom-4 md:left-4 md:right-auto md:max-w-md">
    <p>May we count visits to our public pages with Google Analytics? It sets no cookies and stores nothing in your browser, so we'll ask again next visit. <Link href="/privacy#cookies" className="underline">Details</Link></p>
    <div className="flex gap-2"><button onClick={() => setConsent("denied")} className={btn}>No thanks</button><button onClick={() => setConsent("granted")} className="min-h-10 rounded-xl bg-turmeric px-4 py-2 font-semibold text-ink transition hover:brightness-110">Allow</button></div></div>;
}
