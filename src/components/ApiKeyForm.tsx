"use client";
import { useActionState } from "react";
import { createApiKey } from "@/app/actions";
import { inp, btn } from "./ui";
export default function ApiKeyForm() {
  const [s, act, busy] = useActionState(createApiKey, {} as { key?: string; error?: string });
  return <div className="space-y-3"><form action={act} className="flex flex-col gap-2 sm:flex-row"><input name="name" required maxLength={60} placeholder="Name, e.g. Marketplace sync" aria-label="Key name" className={inp} /><button className={btn} disabled={busy}>{busy ? "Creating…" : "Create key"}</button></form>
    {s.error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">{s.error}</p>}
    {s.key && <div className="glass p-4"><p className="text-sm font-semibold">Copy this key now. It is shown only once and cannot be recovered.</p><code className="mt-2 block break-all rounded bg-white/70 p-2 text-xs">{s.key}</code></div>}</div>;
}
