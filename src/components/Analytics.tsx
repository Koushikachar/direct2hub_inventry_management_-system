"use client";
import { useEffect, useSyncExternalStore } from "react"; import { usePathname } from "next/navigation"; import Script from "next/script";
import { getConsent, subscribe } from "@/lib/consent"; import { gaId, isPublicPath } from "@/lib/seo";
/** Google Analytics 4 with no browser storage. It loads only if (1) NEXT_PUBLIC_GA_ID is set, (2) the visitor pressed Allow on this visit, and (3) the page is public, never the signed-in app. `client_storage: 'none'` keeps GA from writing any cookie, so each visit counts as anonymous. If the choice is withdrawn, GA's own kill switch stops further hits. */
export default function Analytics() {
  const id = gaId(), path = usePathname(), consent = useSyncExternalStore(subscribe, getConsent, () => null), on = !!id && consent === "granted" && isPublicPath(path);
  useEffect(() => { if (id) (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = !on; }, [id, on]);
  if (!id || consent !== "granted" || !isPublicPath(path)) return null;
  return <><Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
    <Script id="ga-init" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}',{anonymize_ip:true,client_storage:'none',allow_google_signals:false,allow_ad_personalization_signals:false});`}</Script></>;
}
