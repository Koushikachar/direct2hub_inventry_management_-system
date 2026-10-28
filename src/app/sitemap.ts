import type { MetadataRoute } from "next"; import { siteUrl } from "@/lib/seo";
/** Only pages worth finding in search. Dates are when the content last meaningfully changed, not "now", so crawlers can trust them. */
const PAGES: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number; updated: string }[] = [
  { path: "", changeFrequency: "weekly", priority: 1, updated: "2026-10-24" }, { path: "/pricing", changeFrequency: "monthly", priority: 0.9, updated: "2026-10-24" }, { path: "/contact", changeFrequency: "yearly", priority: 0.6, updated: "2026-10-24" },
  { path: "/register", changeFrequency: "yearly", priority: 0.5, updated: "2026-10-24" }, { path: "/login", changeFrequency: "yearly", priority: 0.3, updated: "2026-10-24" }, { path: "/privacy", changeFrequency: "yearly", priority: 0.3, updated: "2026-10-20" }, { path: "/terms", changeFrequency: "yearly", priority: 0.3, updated: "2026-10-20" }];
export default function sitemap(): MetadataRoute.Sitemap { return PAGES.map((p) => ({ url: `${siteUrl()}${p.path}`, lastModified: new Date(p.updated), changeFrequency: p.changeFrequency, priority: p.priority })); }
