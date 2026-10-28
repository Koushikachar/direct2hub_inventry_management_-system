import Link from "next/link"; import SiteFooter from "@/components/SiteFooter"; import Breadcrumbs from "@/components/Breadcrumbs"; import JsonLd from "@/components/JsonLd"; import Turnstile from "@/components/Turnstile"; import ChatWidget from "@/components/ChatWidget"; import SubmitButton from "@/components/SubmitButton";
import { pageMeta, siteUrl } from "@/lib/seo"; import { LEGAL, legalReady } from "@/lib/legal"; import { submitContact } from "@/app/actions";
import { Bricolage_Grotesque } from "next/font/google";
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "800"] });
export const metadata = pageMeta({ title: "Contact us", description: "Questions about Direct2Hub, pricing or setting up your business? Send us a message and we'll reply by email, usually within one working day.", path: "/contact" });
const field = "mt-1 block min-h-11 w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-base text-ink placeholder:text-ink/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";
const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const info: [string, string, string][] = [["Reply time", "Usually within one working day, by email.", "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"], ["Pricing questions", "See every plan and its limits before you write.", "M12 3v18M16.5 7.5C15.5 6.5 14 6 12 6c-2.5 0-4 1-4 2.8 0 4 8.5 2 8.5 6.2C16.5 16.8 14.8 18 12 18c-2 0-3.8-.6-4.8-1.8"], ["Getting started", "A free account is enough to try everything.", "M5 12l5 5L20 7"]];
export default async function Contact({ searchParams }: { searchParams: Promise<{ sent?: string; e?: string }> }) {
  const { sent, e } = await searchParams;
  return <div className="text-ink"><JsonLd data={{ "@context": "https://schema.org", "@type": "ContactPage", name: "Contact Direct2Hub", url: `${siteUrl()}/contact` }} />
    <header className="glass sticky top-3 z-10 mx-3 mt-3 flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5 md:mx-auto md:px-6 md:py-3"><Link href="/" className="whitespace-nowrap text-lg font-bold md:text-xl">Direct<span className="text-turmeric">2</span>Hub</Link>
      <nav className="flex items-center gap-1 whitespace-nowrap text-sm md:gap-3"><Link href="/pricing" className="hidden px-2 py-2 hover:underline sm:block">Pricing</Link><Link href="/login" className="px-2 py-2 hover:underline">Sign in</Link><Link href="/register" className="rounded-lg bg-ink px-3 py-2 font-semibold text-white transition-colors hover:bg-brandDark md:px-4">Create account</Link></nav></header>
    <main className="mx-auto max-w-6xl px-6 pb-10 pt-12"><Breadcrumbs trail={[{ name: "Contact", path: "/contact" }]} />
      <h1 className={`${display.className} mt-3 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl`}>Contact us</h1>
      <p className="mt-4 max-w-xl text-lg text-ink/70">Questions about Direct2Hub, pricing or getting your products in? Send a message and we'll reply by email.</p>
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {sent ? <div role="status" className="glass space-y-3 p-6 md:p-8"><div className="grid h-12 w-12 place-items-center rounded-full bg-brand/15 text-brand"><Icon d="M5 12l5 5L20 7" /></div><h2 className="text-xl font-semibold text-brand">Thanks, we've got your message.</h2><p className="text-sm text-ink/70">We'll reply to the email address you gave. While you wait, you can look at the <Link href="/pricing" className="text-brand underline">plans</Link> or <Link href="/register" className="text-brand underline">create a free account</Link>.</p></div>
        : <form action={submitContact} className="glass relative space-y-4 p-6 md:p-8">
          {e && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{e}</p>}
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Your name<input name="name" required minLength={2} maxLength={100} autoComplete="name" placeholder="Asha Rao" className={field} /></label>
            <label className="text-sm font-medium">Email<input name="email" type="email" required maxLength={200} autoComplete="email" placeholder="you@yourshop.com" className={field} /></label></div>
          <label className="block text-sm font-medium">Phone <span className="font-normal text-ink/60">(optional)</span><input name="phone" type="tel" maxLength={20} autoComplete="tel" placeholder="+91 98450 00000" className={field} /></label>
          <label className="block text-sm font-medium">How can we help?<textarea name="message" required minLength={10} maxLength={2000} rows={6} placeholder="Tell us a little about your business and what you need." className={`${field} resize-y`} /></label>
          <div aria-hidden className="sr-only"><label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <Turnstile /><SubmitButton pendingText="Sending…" className="min-h-11 w-full rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-brandDark sm:w-auto">Send message</SubmitButton>
          <p className="text-xs text-ink/60">We use your details only to reply. See our <Link href="/privacy" className="underline">privacy policy</Link>.</p></form>}
        <aside className="space-y-4" aria-label="Other ways to reach us">
          <div className="glass divide-y divide-white/70">{info.map(([t, d, ic]) => <div key={t} className="flex gap-3 p-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Icon d={ic} /></span><div><h2 className="font-semibold">{t}</h2><p className="mt-0.5 text-sm text-ink/70">{d}</p></div></div>)}</div>
          <section className="glass p-5 text-sm"><h2 className="font-semibold">Prefer email?</h2><p className="mt-1 break-words text-ink/70">{legalReady ? <>Write to <a href={`mailto:${LEGAL.email}`} className="text-brand underline">{LEGAL.email}</a>. </> : "Use the form and we'll write back. "}{process.env.NEXT_PUBLIC_COMPANY_ADDRESS ? `${LEGAL.company}, ${LEGAL.address}.` : ""}</p></section></aside></div>
    </main><SiteFooter /><ChatWidget mode="public" /></div>;
}
