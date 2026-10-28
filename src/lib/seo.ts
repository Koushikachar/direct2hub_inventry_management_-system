import type { Metadata } from "next"; import { LEGAL, legalReady } from "./legal";
export const SITE_NAME = "Direct2Hub";
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** One place for per-page metadata: unique title and description, a canonical URL, and matching Open Graph / Twitter cards. `path` is the page's own path (e.g. "/pricing"). */
export function pageMeta(a: { title: string; description: string; path: string; absoluteTitle?: boolean; noindex?: boolean }): Metadata {
  const full = a.absoluteTitle ? a.title : `${a.title} · ${SITE_NAME}`;
  return { title: a.absoluteTitle ? { absolute: a.title } : a.title, description: a.description, alternates: { canonical: a.path },
    openGraph: { title: full, description: a.description, url: a.path, type: "website", siteName: SITE_NAME, locale: "en_IN" }, twitter: { card: "summary_large_image", title: full, description: a.description },
    ...(a.noindex ? { robots: { index: false, follow: false } } : {}) };
}
/** JSON for a <script type="application/ld+json">. "<" is escaped so page text can never close the script tag. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
export const breadcrumbLd = (items: { name: string; path: string }[]) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${siteUrl()}${it.path}` })) });
/** Organization + WebSite for the home page. Only details that are really configured are published (never "[Company name]" placeholders). */
export function organizationLd() {
  const base = siteUrl();
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": `${base}/#organization`, name: SITE_NAME, url: base, logo: { "@type": "ImageObject", url: `${base}/logo.png`, width: 512, height: 512 },
      ...(legalReady ? { legalName: LEGAL.company, email: LEGAL.email, contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: LEGAL.email, url: `${base}/contact`, areaServed: "IN", availableLanguage: ["English"] }] } : { contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", url: `${base}/contact`, areaServed: "IN", availableLanguage: ["English"] }] }),
      ...(process.env.NEXT_PUBLIC_COMPANY_ADDRESS ? { address: { "@type": "PostalAddress", streetAddress: process.env.NEXT_PUBLIC_COMPANY_ADDRESS, addressCountry: "IN" } } : {}) },
    { "@type": "WebSite", "@id": `${base}/#website`, url: base, name: SITE_NAME, inLanguage: "en-IN", publisher: { "@id": `${base}/#organization` } }] };
}
export const GA_RE = /^G-[A-Z0-9]{4,14}$/;
export const gaId = (v = process.env.NEXT_PUBLIC_GA_ID) => (v && GA_RE.test(v) ? v : null);
/** Pages that may be measured by analytics. Signed-in app pages never are. */
export const PUBLIC_PATHS = ["/", "/pricing", "/contact", "/privacy", "/terms", "/login", "/register"];
export const isPublicPath = (p: string) => PUBLIC_PATHS.includes(p);
