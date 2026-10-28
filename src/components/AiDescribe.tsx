"use client";
import { useRef, useState } from "react";
/** Description box with a "Write with AI" button. It reads the product name, SKU and unit from the form it sits in; whatever you have already typed in the box is used as the facts to build on. */
export default function AiDescribe({ defaultValue = "", enabled, disabled }: { defaultValue?: string; enabled: boolean; disabled?: boolean }) {
  const [text, setText] = useState(defaultValue), [lang, setLang] = useState("en"), [busy, setBusy] = useState(false), [err, setErr] = useState(""), root = useRef<HTMLDivElement>(null);
  const write = async () => {
    const f = root.current?.closest("form"), v = (n: string) => (f?.elements.namedItem(n) as HTMLInputElement | null)?.value?.trim() ?? "";
    if (!v("name")) { setErr("Type the product name first"); return; } setErr(""); setBusy(true);
    const r = await fetch("/api/ai/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v("name"), sku: v("sku") || undefined, unit: v("unit") || undefined, notes: text.trim().slice(0, 600) || undefined, language: lang }) }).catch(() => null);
    const j = await r?.json().catch(() => null); if (r?.ok && j?.description) setText(j.description); else setErr(j?.error ?? "Couldn't reach the AI. Try again."); setBusy(false);
  };
  return <div ref={root} className="sm:col-span-full"><div className="flex items-end justify-between gap-2"><label htmlFor="d2h-desc" className="text-sm">Description <span className="text-ink/60">(optional)</span></label>
    {enabled && !disabled && <div className="flex items-center gap-2"><select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)} className="min-h-9 rounded-lg border border-white/70 bg-white/60 px-2 text-sm"><option value="en">English</option><option value="hi">हिन्दी</option><option value="kn">ಕನ್ನಡ</option></select>
      <button type="button" onClick={write} disabled={busy} className="ghost-hit min-h-9 rounded-xl bg-gradient-to-b from-teal-500 to-brand px-3 text-sm font-semibold text-white shadow transition active:scale-95 disabled:opacity-60">{busy ? "Writing…" : "✨ Write with AI"}</button></div>}</div>
    <textarea id="d2h-desc" name="description" rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} placeholder={enabled ? "Type a few facts (colour, size, material), then tap Write with AI. Or write it yourself." : "Describe the product"} className="mt-1 min-h-24 w-full rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-base shadow-inner backdrop-blur transition focus:bg-white/90 md:text-sm" />
    {err && <p role="alert" className="mt-1 text-sm text-danger">{err}</p>}</div>;
}
