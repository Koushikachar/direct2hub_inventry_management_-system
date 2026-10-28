"use client";
import { btn, ghost } from "@/components/ui";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-dvh place-items-center p-6"><div className="glass max-w-md p-8 text-center">
    <h1 className="text-xl font-bold">Something went wrong</h1>
    <p className="mt-2 text-sm text-ink/70">This page couldn't load. Try again. If it keeps happening, the database may be missing its latest migration.</p>
    {error.digest && <p className="mt-3 text-xs text-ink/60">Reference: {error.digest}</p>}
    <div className="mt-5 flex justify-center gap-2"><button onClick={reset} className={btn}>Try again</button><a href="/api/health" className={`${ghost} inline-flex items-center`}>Check status</a></div></div></main>;
}
