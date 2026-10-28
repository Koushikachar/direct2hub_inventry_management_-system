"use client";
import { useState } from "react";
type Listing = { title: string; description: string; bullets: string[]; tags: string[]; seoTitle: string; metaDescription: string };
const Copy = ({ text }: { text: string }) => { const [ok, setOk] = useState(false); return <button type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })} className="ghost-hit min-h-8 rounded-lg px-2 text-xs text-brand underline">{ok ? "Copied" : "Copy"}</button>; };
const Row = ({ label, text }: { label: string; text: string }) => text ? <div className="border-b border-white/60 py-2 last:border-0"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-ink/60">{label}</span><Copy text={text} /></div><p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{text}</p></div> : null;
/** AI side of Product Intelligence: write the listing, explain the numbers, or ask about this one product. */
export default function ProductIntel({ id, ready, canSave }: { id: string; ready: boolean; canSave: boolean }) {
  const [lang, setLang] = useState("en"), [notes, setNotes] = useState(""), [ask, setAsk] = useState(""), [busy, setBusy] = useState(""), [err, setErr] = useState(""), [listing, setListing] = useState<Listing | null>(null), [text, setText] = useState(""), [saved, setSaved] = useState(false);
  const call = async (task: string, extra: Record<string, unknown> = {}) => {
    setErr(""); setBusy(task); const r = await fetch("/api/ai/product", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, task, language: lang, ...extra }) }).catch(() => null), j = await r?.json().catch(() => null); setBusy("");
    if (!r?.ok) { setErr(j?.error ?? "Couldn't reach the AI. Try again."); return null; } return j;
  };
  const btn = "ghost-hit min-h-11 rounded-xl px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-60";
  if (!ready) return <p role="alert" className="glass px-4 py-3 text-sm">The AI isn't switched on yet. Add a free GROQ_API_KEY or GEMINI_API_KEY on the server to write listings and explain the numbers.</p>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)} className="min-h-11 rounded-xl border border-white/70 bg-white/60 px-3 text-sm"><option value="en">English</option><option value="hi">हिन्दी</option><option value="kn">ಕನ್ನಡ</option></select>
      <button type="button" disabled={!!busy} onClick={async () => { const j = await call("insights"); if (j) setText(j.text); }} className={`${btn} border border-white/70 bg-white/60 hover:bg-white/90`}>{busy === "insights" ? "Reading…" : "📊 Explain the numbers"}</button></div>
    {text && <div className="glass whitespace-pre-wrap break-words p-4 text-sm leading-relaxed">{text}</div>}
    <div><label className="text-sm">Facts for the listing <span className="text-ink/60">(optional: colour, size, material…)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={600} className="mt-1 w-full rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-base shadow-inner md:text-sm" /></label>
      <button type="button" disabled={!!busy} onClick={async () => { const j = await call("listing", { notes: notes || undefined }); if (j) { setListing(j.listing); setSaved(false); } }} className={`${btn} mt-2 bg-gradient-to-b from-teal-500 to-brand text-white shadow`}>{busy === "listing" ? "Writing…" : "✨ Write listing"}</button></div>
    {listing && <div className="glass p-4"><Row label="Title" text={listing.title} /><Row label="Description" text={listing.description} /><Row label="Selling points" text={listing.bullets.map((b) => `• ${b}`).join("\n")} /><Row label="Search tags" text={listing.tags.join(", ")} /><Row label="SEO title" text={listing.seoTitle} /><Row label="Meta description" text={listing.metaDescription} />
      {canSave && listing.description && <div className="mt-3 flex items-center gap-3"><button type="button" disabled={!!busy || saved} onClick={async () => { const j = await call("save", { description: listing.description }); if (j?.ok) setSaved(true); }} className={`${btn} bg-gradient-to-b from-teal-500 to-brand text-white shadow`}>{busy === "save" ? "Saving…" : saved ? "Saved to product ✓" : "Save description to product"}</button></div>}</div>}
    <form onSubmit={async (e) => { e.preventDefault(); if (!ask.trim()) return; const j = await call("ask", { question: ask }); if (j) setText(j.text); }} className="flex gap-2"><input value={ask} onChange={(e) => setAsk(e.target.value)} maxLength={500} placeholder="Ask about this product…" aria-label="Ask about this product" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/70 bg-white/60 px-3 text-base md:text-sm" />
      <button type="submit" disabled={!!busy || !ask.trim()} className={`${btn} border border-white/70 bg-white/60 hover:bg-white/90`}>{busy === "ask" ? "…" : "Ask"}</button></form>
    {err && <p role="alert" className="text-sm text-danger">{err}</p>}</div>;
}
