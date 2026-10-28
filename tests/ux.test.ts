import { describe, it, expect } from "vitest";
import { score, rank, goFor, isTyping, GO_KEYS } from "../src/lib/cmdk";
import { inTriangle, inSafeTriangle, keepOpen } from "../src/lib/safetriangle";
describe("command menu ranking", () => {
  it("prefers exact, then prefix, then word start, then contains", () => {
    expect(score("orders", "Orders")).toBeGreaterThan(score("ord", "Orders")); expect(score("ord", "Orders")).toBeGreaterThan(score("ser", "Supplier bills")); expect(score("bills", "Supplier bills")).toBeGreaterThan(score("ill", "Supplier bills")); expect(score("zzz", "Orders")).toBe(0);
  });
  it("ignores case and accents, and matches letters in order", () => { expect(score("ORDERS", "orders")).toBe(100); expect(score("cafe", "Café")).toBe(100); expect(score("ivc", "Invoices")).toBeGreaterThan(0); expect(score("x", "Invoices")).toBe(0); });
  it("ranks a list and keeps the original order for ties", () => {
    const items = [{ label: "Supplier bills" }, { label: "Suppliers" }, { label: "Settings" }]; expect(rank(items, "sup").map((i) => i.label)).toEqual(["Supplier bills", "Suppliers"]); expect(rank(items, "").length).toBe(3);
  });
  it("matches extra search words such as a SKU", () => { expect(rank([{ label: "Blue shirt", words: "SKU-123" }], "sku-123").length).toBe(1); });
});
describe("shortcuts", () => {
  it("maps g + letter to a page and ignores unknown keys", () => { expect(goFor("o")).toBe("/orders"); expect(goFor("O")).toBe("/orders"); expect(goFor("z")).toBeNull(); expect(new Set(Object.values(GO_KEYS)).size).toBe(Object.keys(GO_KEYS).length); });
  it("never fires while typing", () => { expect(isTyping({ tagName: "INPUT" })).toBe(true); expect(isTyping({ tagName: "textarea" })).toBe(true); expect(isTyping({ tagName: "DIV", isContentEditable: true })).toBe(true); expect(isTyping({ tagName: "DIV" })).toBe(false); expect(isTyping(null)).toBe(false); });
});
describe("safe triangle", () => {
  const trigger = { left: 0, right: 200, top: 100, bottom: 140 }, flyout = { left: 210, right: 400, top: 60, bottom: 260 }, from = { x: 150, y: 120 };
  it("recognises points inside and outside a triangle", () => { const a = { x: 0, y: 0 }, b = { x: 10, y: 0 }, c = { x: 0, y: 10 }; expect(inTriangle({ x: 2, y: 2 }, a, b, c)).toBe(true); expect(inTriangle({ x: 9, y: 9 }, a, b, c)).toBe(false); expect(inTriangle({ x: 2, y: 2 }, c, b, a)).toBe(true); });
  it("keeps the flyout open on a diagonal path across other items", () => { expect(inSafeTriangle({ x: 205, y: 170 }, from, flyout)).toBe(true); expect(keepOpen({ x: 190, y: 150 }, from, trigger, flyout)).toBe(true); });
  it("closes when the pointer heads away from the flyout", () => { expect(keepOpen({ x: 100, y: 400 }, from, trigger, flyout)).toBe(false); expect(keepOpen({ x: 205, y: 500 }, from, trigger, flyout)).toBe(false); });
  it("stays open inside the flyout and the trigger", () => { expect(keepOpen({ x: 300, y: 200 }, from, trigger, flyout)).toBe(true); expect(keepOpen({ x: 20, y: 110 }, from, trigger, flyout)).toBe(true); });
});
import { readFileSync } from "node:fs";
describe("static pages and polish rules", () => {
  const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  it("marketing pages that need no per-visitor data are built ahead of time", () => { for (const f of ["src/app/page.tsx", "src/app/terms/page.tsx", "src/app/privacy/page.tsx"]) { const s = read(f); expect(s).toContain('dynamic = "force-static"'); expect(/cookies\(|headers\(|searchParams/.test(s)).toBe(false); } });
  it("global CSS has tabular numbers, balanced headlines, safe areas, view transitions and reduced-motion guards", () => {
    const css = read("src/app/globals.css"); for (const k of ["tabular-nums", "text-wrap: balance", "corner-shape: squircle", "env(safe-area-inset-left)", "@view-transition", "prefers-reduced-motion"]) expect(css).toContain(k);
  });
  it("sheets, menus and toasts animate with CSS transitions, not keyframes, so they can be interrupted", () => { for (const f of ["Sheet", "Toaster", "CommandMenu", "CreateMenu"]) { const s = read(`src/components/${f}.tsx`); expect(s).toContain("transition"); expect(s).not.toContain("@keyframes"); expect(/animate-(?!spin|pulse)/.test(s)).toBe(false); } });
  it("create forms carry an idempotency key and the server checks it", () => {
    const a = read("src/app/actions.ts"); for (const s of ['"order"', '"cn"', '"bill"', '"cust"', '"po"']) expect(a).toContain(`firstUse(c.orgId, fd.get("key"), ${s})`);
    for (const f of ["src/app/(app)/orders/page.tsx", "src/app/(app)/bills/page.tsx", "src/app/(app)/customers/page.tsx", "src/components/PoForm.tsx"]) expect(read(f)).toContain('name="key"');
  });
  it("the one-time code field asks the phone to autofill it", () => { const s = read("src/app/verify/page.tsx"); expect(s).toContain('autoComplete="one-time-code"'); expect(s).toContain('inputMode="numeric"'); });
  it("pages never use browser storage", () => { for (const f of ["Toaster", "CommandMenu", "Sheet"]) expect(/localStorage|sessionStorage/.test(read(`src/components/${f}.tsx`))).toBe(false); });
});
