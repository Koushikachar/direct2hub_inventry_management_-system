"use client";
import { useEffect, useRef, useState } from "react";
type M = { role: "user" | "assistant"; content: string; error?: boolean };
export const APP_TRY = ["Which products are low on stock?", "How did sales go in the last 30 days?", "Show my latest orders", "Who still owes me money?", "Find products with 'cap' in the name"];
const bold = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((x, i) => x.startsWith("**") && x.endsWith("**") ? <strong key={i}>{x.slice(2, -2)}</strong> : x);
/** Chat with your business data. The conversation lives only on this screen (nothing is kept in the browser). */
export default function AssistantChat({ ready, via, endpoint = "/api/ai/chat", tries = APP_TRY, heading = "Ask about your business", intro = "Products, stock, orders, customers, suppliers and sales. I can also write product descriptions and draft messages.", placeholder = "Ask anything…", compact = false, unavailable = "The AI isn't switched on yet. Add a free GROQ_API_KEY or GEMINI_API_KEY on the server." }: { ready: boolean; via?: string; endpoint?: string; tries?: string[]; heading?: string; intro?: string; placeholder?: string; compact?: boolean; unavailable?: string }) {
  const [msgs, setMsgs] = useState<M[]>([]), [q, setQ] = useState(""), [busy, setBusy] = useState(false), end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);
  const send = async (text: string) => {
    text = text.trim(); if (!text || busy) return; const next: M[] = [...msgs, { role: "user", content: text }]; setMsgs(next); setQ(""); setBusy(true);
    const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }) }).catch(() => null), j = await r?.json().catch(() => null);
    setMsgs([...next, r?.ok && j?.reply ? { role: "assistant", content: j.reply } : { role: "assistant", content: j?.error ?? "I couldn't reach the AI. Check your connection and try again.", error: true }]); setBusy(false);
  };
  return <div className={compact ? "flex h-full min-h-0 flex-col" : "glass flex h-[calc(100dvh-15rem)] min-h-[22rem] flex-col md:h-[calc(100dvh-10rem)]"}>
    <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 md:p-4" aria-live="polite">
      {!msgs.length && <div className="py-4 text-center"><p className="text-lg font-semibold">{heading}</p><p className="mx-auto mt-1 max-w-md text-sm text-ink/70">{intro}</p>{via && <p className="mt-1 text-xs text-ink/50">AI: {via}</p>}
        {!ready && <p role="alert" className="mx-auto mt-3 max-w-md rounded-xl border border-turmeric/50 bg-turmeric/15 px-3 py-2 text-sm">{unavailable}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">{tries.map((t) => <button key={t} type="button" disabled={!ready} onClick={() => send(t)} className="ghost-hit min-h-10 rounded-full border border-white/70 bg-white/60 px-3 py-1.5 text-sm transition hover:bg-white/90 disabled:opacity-50">{t}</button>)}</div></div>}
      {msgs.map((m, i) => <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed md:max-w-[75%] ${m.role === "user" ? "bg-gradient-to-b from-teal-500 to-brand text-white" : m.error ? "border border-danger/30 bg-danger/10 text-danger" : "border border-white/70 bg-white/70"}`}>{bold(m.content)}</div></div>)}
      {busy && <div className="flex justify-start"><div className="flex gap-1 rounded-2xl border border-white/70 bg-white/70 px-4 py-3" role="status" aria-label="Thinking">{[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 rounded-full bg-ink/40 motion-safe:animate-bounce" style={{ animationDelay: `${d * 120}ms` }} />)}</div></div>}
      <div ref={end} /></div>
    <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex items-end gap-2 border-t border-white/60 p-2.5 md:p-3">
      <textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(q); } }} rows={1} maxLength={1000} disabled={!ready} aria-label="Your question" placeholder={placeholder} className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 text-base outline-none focus:bg-white" />
      <button type="submit" disabled={busy || !q.trim() || !ready} className="ghost-hit grid h-11 min-w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-teal-500 to-brand px-3 text-sm font-semibold text-white shadow transition active:scale-95 disabled:opacity-50">Send</button></form></div>;
}
