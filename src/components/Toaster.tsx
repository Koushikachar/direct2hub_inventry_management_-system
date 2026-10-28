"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
type Opts = { undo?: () => void | Promise<void>; tone?: "ok" | "err"; ms?: number };
type T = { id: number; msg: string; tone: "ok" | "err"; undo?: Opts["undo"]; ms: number; shown: boolean };
const Ctx = createContext<(msg: string, o?: Opts) => void>(() => {});
export const useToast = () => useContext(Ctx);
let n = 0;

/** Toasts with an optional Undo. Every movement is a CSS transition on state, never a keyframe, so a toast that is dismissed (or swiped, or hovered) halfway through
 *  entering simply reverses from where it is. The timer pauses while the pointer or keyboard focus is on a toast. Swipe sideways to dismiss. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<T[]>([]);
  const hide = useCallback((id: number) => { setList((l) => l.map((t) => (t.id === id ? { ...t, shown: false } : t))); setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 220); }, []);
  const toast = useCallback((msg: string, o: Opts = {}) => {
    const id = ++n; setList((l) => [...l.slice(-2), { id, msg, tone: o.tone ?? "ok", undo: o.undo, ms: o.ms ?? (o.undo ? 7000 : 4000), shown: false }]);
    requestAnimationFrame(() => requestAnimationFrame(() => setList((l) => l.map((t) => (t.id === id ? { ...t, shown: true } : t)))));
  }, []);
  return <Ctx.Provider value={toast}>{children}
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-3 md:bottom-6 md:items-end md:px-6 print:hidden" style={{ bottom: "calc(5.75rem + env(safe-area-inset-bottom))" }}>
      {list.map((t) => <Item key={t.id} t={t} hide={hide} />)}</div></Ctx.Provider>;
}
function Item({ t, hide }: { t: T; hide: (id: number) => void }) {
  const [dx, setDx] = useState(0), [drag, setDrag] = useState(false), start = useRef(0), paused = useRef(false), left = useRef(t.ms), last = useRef(0), busy = useRef(false);
  useEffect(() => { if (!t.shown) return; last.current = Date.now(); const iv = setInterval(() => { const now = Date.now(); if (!paused.current) left.current -= now - last.current; last.current = now; if (left.current <= 0) { clearInterval(iv); hide(t.id); } }, 200); return () => clearInterval(iv); }, [t.shown, t.id, hide]);
  const opacity = t.shown ? Math.max(0.2, 1 - Math.abs(dx) / 220) : 0;
  return <div role={t.tone === "err" ? "alert" : "status"} onPointerEnter={() => (paused.current = true)} onPointerLeave={() => (paused.current = false)} onFocus={() => (paused.current = true)} onBlur={() => (paused.current = false)}
    onPointerDown={(e) => { if ((e.target as HTMLElement).closest("button")) return; start.current = e.clientX; setDrag(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
    onPointerMove={(e) => drag && setDx(e.clientX - start.current)} onPointerUp={() => { setDrag(false); if (Math.abs(dx) > 70) { setDx(dx > 0 ? 400 : -400); hide(t.id); } else setDx(0); }} onPointerCancel={() => { setDrag(false); setDx(0); }}
    className={`pointer-events-auto glass-dark flex w-full max-w-sm touch-pan-y items-center gap-3 px-4 py-3 text-sm ${t.tone === "err" ? "!bg-danger/90" : ""}`}
    style={{ opacity, transform: `translate(${dx}px, ${t.shown ? 0 : 12}px)`, transition: drag ? "none" : "transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms" }}>
    <span className="min-w-0 flex-1">{t.msg}</span>
    {t.undo && <button disabled={busy.current} onClick={async () => { busy.current = true; hide(t.id); try { await t.undo!(); } finally { busy.current = false; } }} className="relative -my-2 -mr-2 rounded-lg px-3 py-2 font-semibold text-turmeric before:absolute before:-inset-1.5 before:content-[''] hover:bg-white/10">Undo</button>}
  </div>;
}
