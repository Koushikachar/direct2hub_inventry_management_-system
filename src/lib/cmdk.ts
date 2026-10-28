/** Pure helpers for the command menu and keyboard shortcuts (no React, so they are easy to test). */
export type Cmd = { id: string; label: string; href: string; group: "Go to" | "Create" | "Results"; hint?: string; keys?: string; words?: string };

/** 0 = no match. Higher is better: exact > starts-with > word-starts-with > contains > letters in order. Case and accents ignored. */
export function score(query: string, label: string, words = ""): number {
  const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(), q = n(query), l = n(label), w = n(words);
  if (!q) return 1; if (l === q) return 100; if (l.startsWith(q)) return 80; if (l.split(/[\s\-_/·]+/).some((p) => p.startsWith(q))) return 65;
  if (l.includes(q)) return 50; if (w && w.includes(q)) return 40;
  let i = 0; for (const ch of l) if (ch === q[i]) i++; return i === q.length && q.length >= 2 ? 20 : 0; // letters in order, e.g. "ivc" -> "Invoices"
}
export function rank<T extends { label: string; words?: string }>(items: T[], query: string, limit = 30): T[] {
  return items.map((it, i) => ({ it, s: score(query, it.label, it.words), i })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, limit).map((x) => x.it);
}
/** Two-key "go to" shortcuts: press g, then a letter, within 1.2 seconds. */
export const GO_KEYS: Record<string, string> = { d: "/dashboard", p: "/products", i: "/inventory", o: "/orders", v: "/invoices", c: "/customers", u: "/purchases", r: "/reports", n: "/notifications", s: "/settings" };
export const goFor = (key: string) => GO_KEYS[key.toLowerCase()] ?? null;
/** Shortcuts must never fire while someone is typing in a field. */
export const isTyping = (el: { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null | undefined) =>
  !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(String(el.tagName).toUpperCase()) || !!el.isContentEditable || el.getAttribute?.("role") === "textbox");
