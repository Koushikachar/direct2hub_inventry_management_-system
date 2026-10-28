"use client";
import { useEffect, useRef, useState } from "react";
import { useBackClose } from "./useBackClose";
/** A bottom sheet for phones. Drag it down to dismiss (a quick flick works too). Back closes it. Motion is a CSS transition driven by state, so grabbing the sheet
 *  while it is still opening or closing picks up from where it is instead of jumping. */
export default function Sheet({ open, onClose, title, children, className = "" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open), [shown, setShown] = useState(false), [y, setY] = useState(0), [drag, setDrag] = useState(false);
  const panel = useRef<HTMLDivElement>(null), g = useRef({ off: 0, ly: 0, lt: 0, v: 0 });
  useBackClose(open, onClose);
  useEffect(() => {
    if (open) { setMounted(true); setY(0); const a = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); return () => cancelAnimationFrame(a); }
    setShown(false); const t = setTimeout(() => setMounted(false), 280); return () => clearTimeout(t);
  }, [open]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); document.addEventListener("keydown", k); const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; panel.current?.focus(); return () => { document.removeEventListener("keydown", k); document.body.style.overflow = prev; }; }, [open, onClose]);
  if (!mounted) return null;
  const h = panel.current?.offsetHeight ?? 400, dim = shown ? Math.max(0, 1 - y / h) : 0;
  return <div className="fixed inset-0 z-40 md:hidden print:hidden">
    <div aria-hidden onClick={onClose} className="absolute inset-0 bg-ink/40" style={{ opacity: dim, transition: drag ? "none" : "opacity 260ms" }} />
    <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`glass-dark absolute inset-x-0 bottom-0 max-h-[85dvh] touch-pan-y overflow-hidden !rounded-b-none outline-none ${className}`}
      style={{ transform: `translateY(${shown ? y : h}px)`, transition: drag ? "none" : "transform 280ms cubic-bezier(.2,.8,.2,1)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="grid h-9 cursor-grab touch-none place-items-center" onPointerDown={(e) => {
        const r = panel.current!.getBoundingClientRect(), rest = window.innerHeight - h, off = Math.max(0, r.top - rest); // where the sheet is right now, even mid-animation
        g.current = { off: e.clientY - off, ly: e.clientY, lt: e.timeStamp, v: 0 }; setY(off); setDrag(true); e.currentTarget.setPointerCapture(e.pointerId);
      }} onPointerMove={(e) => { if (!drag) return; const dt = Math.max(1, e.timeStamp - g.current.lt); g.current.v = (e.clientY - g.current.ly) / dt; g.current.ly = e.clientY; g.current.lt = e.timeStamp; setY(Math.max(0, e.clientY - g.current.off)); }}
        onPointerUp={() => { setDrag(false); if (y > 90 || g.current.v > 0.6) onClose(); else setY(0); }} onPointerCancel={() => { setDrag(false); setY(0); }}>
        <span aria-hidden className="h-1.5 w-10 rounded-full bg-white/40" /></div>
      <div className="max-h-[calc(85dvh-2.25rem)] overflow-y-auto overscroll-contain px-2 pb-3">{children}</div>
    </div></div>;
}
