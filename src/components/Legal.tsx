import Link from "next/link"; import SiteFooter from "./SiteFooter"; import Breadcrumbs from "./Breadcrumbs"; import { LEGAL, legalReady } from "@/lib/legal";
export const H = ({ id, children }: { id?: string; children: React.ReactNode }) => <h2 id={id} className="pt-2 text-lg font-semibold">{children}</h2>;
export default function Legal({ title, path, children }: { title: string; path: string; children: React.ReactNode }) {
  return <div><header className="mx-auto max-w-3xl px-6 pt-6"><Link href="/" className="text-lg font-bold">Direct<span className="text-turmeric">2</span>Hub</Link></header>
    <main className="glass mx-3 my-6 max-w-3xl space-y-3 p-6 text-sm leading-relaxed md:mx-auto md:p-10"><Breadcrumbs trail={[{ name: title, path }]} /><h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-ink/60">Last updated: {LEGAL.updated}. Operated by {LEGAL.company}, {LEGAL.address}. Contact: {LEGAL.email}.</p>
      {!legalReady && <p role="note" className="rounded-xl bg-turmeric/25 p-3 text-xs">Before launch: set NEXT_PUBLIC_COMPANY_NAME and NEXT_PUBLIC_CONTACT_EMAIL, and have a qualified lawyer review this page. It is not legal advice and does not claim compliance with any law.</p>}
      {children}</main><SiteFooter /></div>;
}
