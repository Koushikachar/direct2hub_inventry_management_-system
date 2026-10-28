import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { jsonLd, breadcrumbLd, pageMeta, gaId, isPublicPath, PUBLIC_PATHS, organizationLd } from "../src/lib/seo";
import { getConsent, setConsent, subscribe } from "../src/lib/consent";
import { readFileSync } from "fs";
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
const req = createRequire(import.meta.url);
const loadConfig = (env: Record<string, string | undefined>) => { const keep = { ...process.env }; Object.assign(process.env, env); for (const k of Object.keys(env)) if (env[k] === undefined) delete process.env[k]; const p = req.resolve("../next.config.js"); delete req.cache[p]; const c = req(p); return { c, restore: () => { for (const k of Object.keys(env)) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; } } }; };
describe("structured data", () => {
  it("can't be broken out of its script tag", () => { const s = jsonLd({ name: "</script><script>alert(1)</script>" }); expect(s.includes("<")).toBe(false); expect(JSON.parse(s).name).toBe("</script><script>alert(1)</script>"); });
  it("numbers breadcrumbs from 1 and uses absolute URLs", () => { const b: any = breadcrumbLd([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }]); expect(b["@type"]).toBe("BreadcrumbList"); expect(b.itemListElement[1].position).toBe(2); expect(b.itemListElement[1].item.startsWith("http")).toBe(true); expect(b.itemListElement[1].item.endsWith("/pricing")).toBe(true); });
  it("never publishes placeholder company details", () => { const o: any = organizationLd(); const org = o["@graph"][0]; expect(org.name).toBe("Direct2Hub"); for (const ph of ["[Company", "[contact", "[registered"]) expect(JSON.stringify(o).includes(ph)).toBe(false); expect(org.logo.url.endsWith("/logo.png")).toBe(true); });
});
describe("page metadata", () => {
  it("gives each page a canonical URL and matching social card", () => { const m: any = pageMeta({ title: "Pricing", description: "d", path: "/pricing" }); expect(m.alternates.canonical).toBe("/pricing"); expect(m.openGraph.url).toBe("/pricing"); expect(m.openGraph.title).toBe("Pricing · Direct2Hub"); expect(m.title).toBe("Pricing"); expect(m.robots).toBe(undefined); });
  it("supports absolute titles and noindex", () => { const m: any = pageMeta({ title: "Home page", description: "d", path: "/", absoluteTitle: true, noindex: true }); expect(m.title.absolute).toBe("Home page"); expect(m.openGraph.title).toBe("Home page"); expect(m.robots.index).toBe(false); });
});
describe("analytics and consent", () => {
  it("accepts only real GA4 IDs", () => { expect(gaId("G-ABC123XYZ9")).toBe("G-ABC123XYZ9"); expect(gaId("UA-12345-1")).toBe(null); expect(gaId("G-1');alert(1);('")).toBe(null); expect(gaId(undefined)).toBe(null); });
  it("never measures the signed-in app", () => { expect(isPublicPath("/pricing")).toBe(true); expect(isPublicPath("/")).toBe(true); expect(isPublicPath("/dashboard")).toBe(false); expect(isPublicPath("/invoices/abc")).toBe(false); expect(isPublicPath("/settings")).toBe(false); });
  it("keeps the analytics choice in memory only, and tells listeners", () => { expect(getConsent()).toBe(null); let n = 0; const off = subscribe(() => { n++; }); setConsent("granted"); expect(getConsent()).toBe("granted"); setConsent(null); expect(n).toBe(2); off(); setConsent("denied"); expect(n).toBe(2); setConsent(null); });
  it("never writes to cookies or storage, and turns GA's own cookies off", () => { for (const f of ["src/lib/consent.ts", "src/components/CookieNotice.tsx", "src/components/CookieSettings.tsx", "src/components/Analytics.tsx"]) { const t = readFileSync(f, "utf8"); expect(/document\.cookie|localStorage|sessionStorage|indexedDB/.test(t.replace(/\/\*\*[\s\S]*?\*\//g, ""))).toBe(false); }
    const a = readFileSync("src/components/Analytics.tsx", "utf8"); expect(a.includes("client_storage:'none'")).toBe(true); expect(a.includes("allow_google_signals:false")).toBe(true); });
});
describe("redirects", () => {
  it("are all permanent 301s with no loops or chains", async () => { const { c, restore } = loadConfig({ NEXT_PUBLIC_SITE_URL: undefined }); const r = await c.redirects(); restore();
    expect(r.length > 10).toBe(true); const sources = new Set(r.map((x: any) => x.source)); for (const x of r) { expect(x.statusCode).toBe(301); expect(x.source === x.destination).toBe(false); expect(sources.has(x.destination)).toBe(false); } });
  it("sends www to the real host (and not on localhost)", async () => { let { c, restore } = loadConfig({ NEXT_PUBLIC_SITE_URL: "https://example.com" }); let r = await c.redirects(); restore(); const h = r.find((x: any) => x.has); expect(h.has[0].value).toBe("www.example.com"); expect(h.destination).toBe("https://example.com/:path*"); expect(h.statusCode).toBe(301);
    ({ c, restore } = loadConfig({ NEXT_PUBLIC_SITE_URL: "https://www.example.com" })); r = await c.redirects(); restore(); expect(r.find((x: any) => x.has).has[0].value).toBe("example.com");
    ({ c, restore } = loadConfig({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })); r = await c.redirects(); restore(); expect(r.some((x: any) => x.has)).toBe(false); });
  it("allows Google Analytics in the CSP only when it is configured", async () => { const csp = async (env: Record<string, string | undefined>) => { const { c, restore } = loadConfig({ NODE_ENV: "production", ...env }); const h = await c.headers(); restore(); return h[0].headers.find((x: any) => x.key === "Content-Security-Policy").value as string; };
    expect((await csp({ NEXT_PUBLIC_GA_ID: undefined })).includes("googletagmanager")).toBe(false); const on = await csp({ NEXT_PUBLIC_GA_ID: "G-ABC123XYZ9" }); expect(on.includes("https://www.googletagmanager.com")).toBe(true); expect(on.includes("google-analytics.com")).toBe(true); });
});
describe("robots and sitemap", () => {
  it("lists public pages and never lists a page that robots.txt blocks", () => { const r: any = robots(), blocked: string[] = r.rules.disallow, urls = sitemap().map((s) => new URL(s.url).pathname);
    expect(urls.includes("/pricing") && urls.includes("/contact") && urls.includes("/")).toBe(true); for (const u of urls) expect(blocked.some((b) => u === b || u.startsWith(b + "/"))).toBe(false); expect(r.sitemap.endsWith("/sitemap.xml")).toBe(true); });
  it("blocks signed-in areas", () => { const r: any = robots(); for (const p of ["/dashboard", "/admin", "/api", "/invoices", "/subscription", "/traceability", "/kits"]) expect(r.rules.disallow.includes(p)).toBe(true); for (const p of PUBLIC_PATHS) expect(r.rules.disallow.includes(p)).toBe(false); });
});
