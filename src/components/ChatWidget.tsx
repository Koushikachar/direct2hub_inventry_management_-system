"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AssistantChat from "./AssistantChat"; import { useBackClose } from "./useBackClose";
const PUBLIC_TRY = ["What does Direct2Hub do?", "How much does it cost?", "Is there a free plan?", "Does it make GST invoices?"];
const Bubble = () => <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z" /><path d="M9 11h.01M12 11h.01M15 11h.01" /></svg>;
/** The chat bubble in the bottom-right corner. "public": on the home and pricing pages it answers visitors' questions about Direct2Hub (no account, no private data). "app": after sign-in it is the business assistant.
 *  It only appears when the AI is switched on, and the conversation is kept in memory only. */
export default function ChatWidget({ mode, ready = true, via }: { mode: "public" | "app"; ready?: boolean; via?: string }) {
  const path = usePathname() ?? "", app = mode === "app", [open, setOpen] = useState(false), [avail, setAvail] = useState(app), close = useCallback(() => setOpen(false), []);
  useEffect(() => { if (app) return; let live = true; fetch("/api/ai/public").then((r) => r.json()).then((j) => live && setAvail(!!j.ready)).catch(() => { }); return () => { live = false; }; }, [app]);
  useBackClose(open, close);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && close(); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open, close]);
  if (!avail || (app && path.startsWith("/assistant"))) return null;
  const title = app ? "Business assistant" : "Ask Direct2Hub";
  return <>
    {!open && <button type="button" onClick={() => setOpen(true)} aria-label={app ? "Open the assistant" : "Chat with us"} title={app ? "Assistant" : "Chat with us"} aria-haspopup="dialog"
      className={`fixed right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-b from-teal-500 to-brand text-white shadow-[0_8px_24px_rgba(15,118,110,.45)] transition active:scale-95 md:right-6 print:hidden ${app ? "bottom-[calc(9.5rem+env(safe-area-inset-bottom))] md:bottom-10" : "bottom-[calc(1rem+env(safe-area-inset-bottom))] md:bottom-8"}`}><Bubble /></button>}
    {open && <div role="dialog" aria-modal="false" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-[#f4f8fa] md:inset-auto md:bottom-5 md:right-5 md:h-[min(36rem,calc(100dvh-2.5rem))] md:w-[24rem] md:overflow-hidden md:rounded-2xl md:border md:border-white/70 md:shadow-[0_20px_60px_rgba(14,27,43,.35)] print:hidden" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center justify-between bg-gradient-to-r from-brand to-brandDark px-4 py-3 text-white"><div><p className="font-semibold">{title}</p><p className="text-xs text-white/75">{app ? "Answers from your own data" : "Quick answers about the product"}</p></div>
        <button type="button" onClick={close} aria-label="Close chat" className="grid h-10 w-10 place-items-center rounded-xl text-2xl leading-none hover:bg-white/15">×</button></div>
      <div className="min-h-0 flex-1 bg-white/40">{app
        ? <AssistantChat compact ready={ready} via={via} heading="Ask about your business" intro="Stock, orders, customers and sales. I can also write product descriptions." />
        : <AssistantChat compact ready endpoint="/api/ai/public" tries={PUBLIC_TRY} heading="Hi, how can I help?" intro="Ask about features, pricing or getting started. I only know Direct2Hub, and for anything else there is the contact page." placeholder="Type your question…" />}</div></div>}
  </>;
}
