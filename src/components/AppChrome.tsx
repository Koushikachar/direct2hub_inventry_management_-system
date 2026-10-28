"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import TransitionLink, { ViewTransitionGate } from "./TransitionLink"; import CommandMenu, { openCommandMenu } from "./CommandMenu"; import CreateMenu from "./CreateMenu"; import ChatWidget from "./ChatWidget"; import { leaveLayer } from "./useBackClose"; import Sheet from "./Sheet"; import type { Cmd } from "@/lib/cmdk";
const nav = ["Dashboard", "Products", "Inventory", "Warehouses", "Assembly", "Batches & serials", "Counts", "Orders", "Invoices", "Customers", "Purchases", "Receipts", "Supplier bills", "Suppliers", "Returns", "Analytics", "Reports", "Notifications", "Assistant", "Product intelligence", "Integrations", "Webhooks", "Automations", "My plan", "Settings"];
// Menu label -> route, where they differ. "Supplier bills" = what you owe suppliers; "My plan" = what you pay Direct2Hub.
const ROUTE: Record<string, string> = { Dashboard: "/dashboard", "Supplier bills": "/bills", "My plan": "/subscription", "Batches & serials": "/traceability", "Product intelligence": "/intelligence" };
const href = (n: string) => ROUTE[n] ?? `/${n.toLowerCase()}`;
const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const tabs: [string, string, string][] = [["Home", "Dashboard", "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"], ["Stock", "Inventory", "M12 3 3 7.5v9L12 21l9-4.5v-9L12 3zM3 7.5l9 4.5 9-4.5M12 12v9"],
["Orders", "Orders", "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6"], ["Alerts", "Notifications", "M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0"]];
const more = ["Products", "Customers", "Invoices", "Warehouses", "Assembly", "Batches & serials", "Counts", "Purchases", "Receipts", "Supplier bills", "Suppliers", "Returns", "Analytics", "Reports", "Integrations", "Webhooks", "Automations", "My plan", "Settings"];
const menu = nav.filter((n) => n !== "Assistant" && n !== "Product intelligence"); // the sidebar list: Assistant is the chat icon, Product intelligence is the PI button at the top right
const quick: [string, string][] = [["New order", "/orders"], ["Add product", "/products"], ["Adjust stock", "/inventory"], ["Count stock", "/counts"], ["Receive goods", "/purchases"]];
const KEYS: Record<string, string> = { Dashboard: "g d", Products: "g p", Inventory: "g i", Orders: "g o", Invoices: "g v", Customers: "g c", Purchases: "g u", Reports: "g r", Notifications: "g n", Settings: "g s" };
const commands: Cmd[] = [...quick.map(([l, h]): Cmd => ({ id: `q:${l}`, label: l, href: h, group: "Create" })), ...nav.map((n): Cmd => ({ id: `n:${n}`, label: n, href: href(n), group: "Go to", keys: KEYS[n] }))];
const AI_ICON = "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z";
/** Product intelligence: a small "PI" button with an AI sparkle, shown at the top right on phones and desktops. */
const PiButton = ({ on, className = "" }: { on: boolean; className?: string }) => <TransitionLink href="/intelligence" aria-label="Product intelligence (AI)" title="Product intelligence" aria-current={on ? "page" : undefined} className={`inline-flex h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold backdrop-blur transition active:scale-95 ${on ? "border-brand bg-brand text-white" : "border-brand/40 bg-white/60 text-brand hover:bg-white/90"} ${className}`}><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden><path d={AI_ICON} /></svg>PI</TransitionLink>;
const Kbd = ({ k }: { k: string }) => <span className="ml-2 hidden gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:[@media(pointer:fine)]:inline-flex">{k.split(" ").map((x) => <kbd key={x} className="rounded border border-white/25 px-1 font-mono text-[10px] text-white/70">{x}</kbd>)}</span>;
const badge = (n: number, cls = "") => n > 0 ? <span className={`rounded-full bg-turmeric px-1.5 text-xs font-semibold text-ink ${cls}`}>{n}</span> : null;

/** Persistent app frame. It lives in the shared layout, so clicking a link swaps only the page area; the active item updates instantly from the URL. */
export default function AppChrome({ admin, unread, ai, children }: { admin: boolean; unread: number; ai?: { ready: boolean; via: string }; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const active = path.startsWith("/admin") ? "Admin" : nav.find((n) => path === href(n) || path.startsWith(href(n) + "/")) ?? "";
  const inMore = more.includes(active) || active === "Admin", [moreOpen, setMore] = useState(false), [quickOpen, setQuick] = useState(false), closeAll = () => { setMore(false); setQuick(false); }, go = () => { leaveLayer(); closeAll(); }; // go: a link inside a sheet was chosen, so the sheet closes without undoing the navigation
  return (
    <div className="min-h-dvh print:block md:grid md:grid-cols-[250px_minmax(0,1fr)] md:gap-4 md:p-4">
      <header className="mx-4 mt-4 flex items-center justify-between md:hidden print:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}><TransitionLink href="/dashboard" className="text-lg font-bold">Direct<span className="text-turmeric">2</span>Hub</TransitionLink><div className="flex items-center gap-2"><PiButton on={active === "Product intelligence"} /><button type="button" onClick={openCommandMenu} aria-label="Search" className="relative grid h-11 w-11 place-items-center rounded-xl border border-white/70 bg-white/50 backdrop-blur"><Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" /></button></div></header><ViewTransitionGate /><CommandMenu commands={commands} />
      <aside style={{ viewTransitionName: "d2h-side" }} className="print:hidden glass-dark hidden p-5 md:sticky md:top-4 md:block md:h-[calc(100dvh-2rem)] md:overflow-y-auto">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight">Direct<span className="text-turmeric">2</span>Hub</Link>
        <button type="button" onClick={openCommandMenu} className="mt-5 flex min-h-10 w-full items-center justify-between rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/70 transition hover:bg-white/20"><span>Search…</span><span className="flex gap-1"><kbd className="rounded border border-white/25 px-1 font-mono text-[10px]">Ctrl</kbd><kbd className="rounded border border-white/25 px-1 font-mono text-[10px]">K</kbd></span></button>
        <div className="mt-3"><CreateMenu label="Create" items={quick} /></div>
        <nav aria-label="Main" className="mt-4 flex flex-col gap-1">
          {menu.map((n) => <TransitionLink key={n} href={href(n)} aria-current={active === n ? "page" : undefined} className={`group flex items-center justify-between whitespace-nowrap rounded-xl px-3 py-2 text-sm transition ${active === n ? "bg-white/20 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,.25)]" : "text-white/70 hover:bg-white/10"}`}><span className="flex items-center">{n}{KEYS[n] && <Kbd k={KEYS[n]} />}</span>{n === "Notifications" && badge(unread, "ml-2")}</TransitionLink>)}
          {admin && <Link href="/admin" className={`mt-2 whitespace-nowrap rounded-xl border border-turmeric/60 px-3 py-2 text-sm text-turmeric transition hover:bg-turmeric/10 ${active === "Admin" ? "bg-turmeric/15" : ""}`}>Platform admin</Link>}
        </nav>
      </aside>
      <ChatWidget mode="app" ready={!!ai?.ready} via={ai?.via} />
      <main className="relative min-w-0 print:p-0 p-4 pb-40 md:p-2 md:pb-2"><PiButton on={active === "Product intelligence"} className="absolute right-2 top-2 z-20 hidden md:inline-flex print:hidden" />{children}</main>

      <button type="button" aria-label="Quick actions" aria-haspopup="dialog" onClick={() => { setMore(false); setQuick(true); }} className="fixed right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-b from-teal-400 to-brand text-3xl leading-none text-white shadow-[0_8px_24px_rgba(15,118,110,.5)] transition active:scale-95 md:hidden print:hidden" style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}><span aria-hidden>+</span></button>
      <Sheet open={quickOpen} onClose={() => setQuick(false)} title="Quick actions"><p className="px-3 pb-1 pt-1 text-xs uppercase tracking-wide text-white/60">Quick actions</p>{quick.map(([l, h]) => <TransitionLink key={l} href={h} replace onClick={go} className="flex min-h-12 items-center rounded-xl px-3 text-base hover:bg-white/10">{l}</TransitionLink>)}</Sheet>
      <Sheet open={moreOpen} onClose={() => setMore(false)} title="More"><div className="grid grid-cols-2 gap-1">{more.map((n) => <TransitionLink key={n} href={href(n)} replace onClick={go} className={`flex min-h-12 items-center rounded-xl px-3 text-base ${active === n ? "bg-white/20 font-semibold" : "hover:bg-white/10"}`}>{n}</TransitionLink>)}
        {admin && <Link href="/admin" replace onClick={go} className="col-span-2 flex min-h-12 items-center justify-center rounded-xl border border-turmeric/60 text-turmeric">Platform admin</Link>}</div></Sheet>
      <nav aria-label="Main" className="glass-dark print:hidden fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 items-stretch px-1.5 pt-1.5 md:hidden" style={{ paddingBottom: "calc(.375rem + env(safe-area-inset-bottom))", viewTransitionName: "d2h-tabbar" }}>
        {tabs.map(([l, n, d]) => <TransitionLink key={l} href={href(n)} aria-current={active === n ? "page" : undefined} className={`relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] ${active === n ? "bg-white/20 font-semibold" : "text-white/70"}`}><Icon d={d} />{l}
          {n === "Notifications" && badge(unread, "absolute right-2.5 top-0 !px-1 text-[10px]")}</TransitionLink>)}
        <button type="button" aria-haspopup="dialog" onClick={() => { setQuick(false); setMore(true); }} className={`relative flex min-h-12 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] ${inMore ? "bg-white/20 font-semibold" : "text-white/70"}`}><Icon d="M5 12h.01M12 12h.01M19 12h.01" />More</button>
      </nav>
    </div>
  );
}
