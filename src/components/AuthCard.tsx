import Link from "next/link";
export default function AuthCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return <main className="grid min-h-dvh md:grid-cols-[1fr_1.1fr] md:gap-4 md:p-4">
    <aside className="glass-dark hidden p-12 md:flex md:flex-col md:justify-between">
      <Link href="/" className="text-xl font-bold">Direct<span className="text-turmeric">2</span>Hub</Link>
      <p className="max-w-sm text-3xl font-extrabold leading-tight">Every unit counted. Every movement on record.</p>
      <p className="text-sm text-white/60">Inventory for sellers, wholesalers and distributors.</p></aside>
    <section className="grid place-items-center p-6"><div className="glass w-full max-w-sm p-8">
      <h1 className="text-2xl font-bold">{title}</h1>{sub && <p className="mt-1 text-sm text-ink/60">{sub}</p>}<div className="mt-6">{children}</div>
      <p className="mt-6 text-xs text-ink/60"><Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link></p></div></section></main>;
}
