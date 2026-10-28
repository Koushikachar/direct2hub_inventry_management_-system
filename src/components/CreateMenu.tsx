"use client";
import { useId, useState } from "react";
import TransitionLink from "./TransitionLink";
/** "Create" in the desktop sidebar. It expands in place (an accordion) instead of flying out to the side, so it can never be clipped by the sidebar's own scroll area
 *  or push the page sideways. It works the same with a mouse, a finger or the keyboard (Esc closes it). */
export default function CreateMenu({ label, items }: { label: string; items: [string, string][] }) {
  const [open, setOpen] = useState(false), id = useId();
  return <div onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className={`flex min-h-10 w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition ${open ? "border-white/40 bg-white/20" : "border-white/25 bg-white/10 hover:bg-white/20"}`}>
      {label}<span aria-hidden className="text-lg leading-none transition-transform duration-200" style={{ transform: open ? "rotate(45deg)" : "none" }}>+</span></button>
    <div id={id} role="region" aria-label={label} className="grid transition-[grid-template-rows] duration-200 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
      <ul className="min-h-0 overflow-hidden" {...(!open ? { inert: true } : {})}>
        {items.map(([l, h]) => <li key={l}><TransitionLink href={h} onClick={() => setOpen(false)} className="mt-1 flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/85 transition hover:bg-white/15 focus-visible:bg-white/15"><span aria-hidden className="text-turmeric">+</span>{l}</TransitionLink></li>)}</ul></div></div>;
}
