import Link from "next/link"; import JsonLd from "./JsonLd"; import { breadcrumbLd } from "@/lib/seo";
/** Visible breadcrumb trail plus the matching BreadcrumbList data for search engines. The last item is the current page. */
export default function Breadcrumbs({ trail }: { trail: { name: string; path: string }[] }) {
  const all = [{ name: "Home", path: "/" }, ...trail];
  return <><nav aria-label="Breadcrumb" className="text-sm text-ink/60"><ol className="flex flex-wrap items-center gap-1.5">{all.map((c, i) => <li key={c.path} className="flex items-center gap-1.5">
    {i < all.length - 1 ? <Link href={c.path} className="underline hover:text-ink">{c.name}</Link> : <span aria-current="page" className="text-ink/80">{c.name}</span>}{i < all.length - 1 && <span aria-hidden>›</span>}</li>)}</ol></nav><JsonLd data={breadcrumbLd(all)} /></>;
}
