"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
let pending: (() => void) | null = null;
/** Mount once. When the page has really changed, it lets the browser finish the cross-fade that TransitionLink started. */
export function ViewTransitionGate() { const path = usePathname(); useEffect(() => { pending?.(); pending = null; }, [path]); return null; }
/** A normal Next link that cross-fades between pages using the browser's View Transitions, where supported. Falls back to a plain link (modified clicks, reduced motion, older browsers). */
export default function TransitionLink({ href, onClick, replace, ...rest }: React.ComponentProps<typeof Link>) {
  const router = useRouter();
  return <Link href={href} replace={replace} {...rest} onClick={(e) => {
    onClick?.(e); const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = typeof href === "string" ? href : href.pathname ?? ""; if (!to.startsWith("/") || to === location.pathname) return;
    e.preventDefault(); doc.startViewTransition(() => new Promise<void>((resolve) => { pending = resolve; if (replace) router.replace(to); else router.push(to); setTimeout(resolve, 1500); })); // the timeout is a safety net so a slow page never freezes the screen
  }} />;
}
