"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { goFor, isTyping, rank, type Cmd } from "@/lib/cmdk";
import { useBackClose, leaveLayer } from "./useBackClose";
export const openCommandMenu = () => window.dispatchEvent(new Event("d2h:cmdk"));
const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="rounded-md border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/80">{children}</kbd>;

/** Ctrl/⌘+K or "/" opens it. Type to jump to a page, start something new, or find a product, customer, order or invoice. "g" then a letter goes straight to a page (g o = Orders).
 *  Search results are remembered per query: a repeat search shows the last answer instantly and refreshes it in the background. */
export default function CommandMenu({ commands }: { commands: Cmd[] }) {
  const router = useRouter(), id = useId(), [open, setOpen] = useState(false), [shown, setShown] = useState(false), [q, setQ] = useState(""), [active, setActive] = useState(0), [remote, setRemote] = useState<Cmd[]>([]), [busy, setBusy] = useState(false);
  const cache = useRef(new Map<string, Cmd[]>()), input = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null), g = useRef(0);
  const close = useCallback(() => { setShown(false); setTimeout(() => setOpen(false), 160); }, []);
  useBackClose(open, close);
  useEffect(() => {
    const show = () => { setQ(""); setActive(0); setRemote([]); setOpen(true); requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open ? close() : show(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target as HTMLElement)) return;
      if (e.key === "/" || e.key === "?") { e.preventDefault(); show(); return; }
      if (Date.now() - g.current < 1200) { g.current = 0; const to = goFor(e.key); if (to) { e.preventDefault(); router.push(to); } return; }
      if (e.key === "g") g.current = Date.now();
    };
    window.addEventListener("keydown", key); window.addEventListener("d2h:cmdk", show); return () => { window.removeEventListener("keydown", key); window.removeEventListener("d2h:cmdk", show); };
  }, [open, close, router]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { // search the account: stale-while-revalidate
    const term = q.trim(); if (!open || term.length < 2) { setRemote([]); setBusy(false); return; }
    const hit = cache.current.get(term.toLowerCase()); if (hit) setRemote(hit); const ac = new AbortController(); setBusy(true);
    const t = setTimeout(async () => { try { const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ac.signal }); if (r.ok) { const j = (await r.json()) as { results: Cmd[] }; cache.current.set(term.toLowerCase(), j.results); setRemote(j.results); } } catch {} finally { if (!ac.signal.aborted) setBusy(false); } }, hit ? 0 : 180);
    return () => { clearTimeout(t); ac.abort(); };
  }, [q, open]);
  const items = [...rank(commands, q, 12), ...remote.filter((r) => !q.trim() || true)], idx = Math.min(active, Math.max(0, items.length - 1));
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" }); }, [idx]);
  if (!open) return null;
  const go = (c: Cmd) => { leaveLayer(); close(); router.replace(c.href); }; // replace: the open menu owns one history entry, so the destination takes its place
  let lastGroup = "";
  return <div className="fixed inset-0 z-[60] print:hidden" role="presentation">
    <div aria-hidden onClick={close} className="absolute inset-0 bg-ink/50 backdrop-blur-sm transition-opacity duration-150" style={{ opacity: shown ? 1 : 0 }} />
    <div role="dialog" aria-modal="true" aria-label="Command menu" className="glass-dark absolute left-1/2 top-[max(1rem,env(safe-area-inset-top))] w-[min(40rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden transition duration-150 md:top-[14vh]" style={{ opacity: shown ? 1 : 0, transform: `translate(-50%, ${shown ? 0 : -8}px) scale(${shown ? 1 : 0.98})` }}>
      <div className="flex items-center gap-3 border-b border-white/15 px-4"><svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-white/60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} role="combobox" aria-expanded="true" aria-controls={`${id}-l`} aria-activedescendant={items[idx] ? `${id}-${idx}` : undefined} aria-autocomplete="list" autoComplete="off" spellCheck={false} enterKeyHint="go" placeholder="Search pages, products, customers, orders…"
          className="min-h-14 w-full bg-transparent text-base text-white outline-none placeholder:text-white/50"
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setActive((idx + 1) % Math.max(1, items.length)); } else if (e.key === "ArrowUp") { e.preventDefault(); setActive((idx - 1 + items.length) % Math.max(1, items.length)); } else if (e.key === "Enter" && items[idx]) { e.preventDefault(); go(items[idx]); } else if (e.key === "Escape") { e.preventDefault(); close(); } }} />
        {busy && <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-2 border-white/60 border-t-transparent motion-safe:animate-spin" />}</div>
      <ul ref={list} id={`${id}-l`} role="listbox" className="max-h-[min(24rem,55vh)] overflow-y-auto overscroll-contain p-2">
        {items.map((c, i) => { const head = c.group !== lastGroup ? c.group : ""; lastGroup = c.group; return <li key={c.id} role="presentation">
          {head && <p className="px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-white/50">{head}</p>}
          <div id={`${id}-${i}`} data-i={i} role="option" aria-selected={i === idx} onMouseMove={() => i !== idx && setActive(i)} onClick={() => go(c)} className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${i === idx ? "bg-white/20" : ""}`}>
            <span className="min-w-0 truncate">{c.label}{c.hint && <span className="ml-2 text-xs text-white/50">{c.hint}</span>}</span>{c.keys && <span className="hidden shrink-0 items-center gap-1 md:flex">{c.keys.split(" ").map((k) => <Kbd key={k}>{k}</Kbd>)}</span>}</div></li>; })}
        {!items.length && <li role="presentation" className="px-3 py-6 text-center text-sm text-white/60">{busy ? "Searching…" : "Nothing matches that."}</li>}</ul>
      <div className="hidden items-center gap-4 border-t border-white/15 px-4 py-2 text-xs text-white/60 md:flex"><span><Kbd>↑</Kbd> <Kbd>↓</Kbd> move</span><span><Kbd>↵</Kbd> open</span><span><Kbd>esc</Kbd> close</span><span className="ml-auto"><Kbd>g</Kbd> then a letter jumps to a page</span></div>
    </div></div>;
}
