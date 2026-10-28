import Link from "next/link"; import CookieSettings from "./CookieSettings";
export default function SiteFooter() {
  return <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-ink/70">
    <span>© {new Date().getFullYear()} Direct2Hub</span><nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer"><Link href="/" className="underline">Home</Link><Link href="/pricing" className="underline">Pricing</Link><Link href="/contact" className="underline">Contact</Link><Link href="/privacy" className="underline">Privacy</Link><Link href="/terms" className="underline">Terms</Link><Link href="/login" className="underline">Sign in</Link><CookieSettings /></nav></footer>;
}
