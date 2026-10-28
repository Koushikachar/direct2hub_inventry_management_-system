import Link from "next/link";
export const metadata = { title: "Page not found" };
export default function NotFound() {
  return <main className="grid min-h-dvh place-items-center p-6"><div className="glass max-w-md p-8 text-center"><p className="text-5xl font-extrabold">404</p>
    <h1 className="mt-2 text-xl font-bold">We couldn't find that page</h1><p className="mt-2 text-sm text-ink/70">It may have moved, or the link is wrong.</p>
    <Link href="/" className="mt-5 inline-block rounded-xl bg-brand px-5 py-2.5 font-semibold text-white">Back to home</Link></div></main>;
}
