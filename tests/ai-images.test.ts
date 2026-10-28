import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("../src/lib/db", () => ({ db: {} })); // these tests never touch the database
import { sniff } from "../src/lib/images"; import { imgUrl } from "../src/lib/imgurl"; import { aiProviders, complete, resetCooldowns } from "../src/lib/ai"; import { TOOLS } from "../src/lib/aitools";
describe("product pictures", () => {
  it("trusts the file signature, not the name", () => {
    expect(sniff(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg"); expect(sniff(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10]))).toBe("png");
    expect(sniff(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("webp");
    expect(sniff(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull(); expect(sniff(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
  it("asks Cloudinary for a small auto-format copy, leaves other hosts alone, and never throws", () => {
    expect(imgUrl("https://res.cloudinary.com/x/image/upload/v1/a.webp", 300)).toBe("https://res.cloudinary.com/x/image/upload/f_auto,q_auto,c_limit,w_300/v1/a.webp");
    expect(imgUrl("https://example.com/a.png")).toBe("https://example.com/a.png"); expect(imgUrl(null)).toBeNull(); expect(imgUrl("not a url")).toBeNull();
  });
});
describe("AI setup", () => {
  const keys = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "AI_PROVIDER", "AI_ORDER", "GROQ_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "GROQ_MODEL"];
  beforeEach(() => { keys.forEach((k) => delete process.env[k]); resetCooldowns(); vi.unstubAllGlobals(); });
  const names = () => aiProviders().map((p) => p.name);
  it("is off until a free key is set; every key set joins the rotation in order", () => {
    expect(names()).toEqual([]); process.env.GEMINI_API_KEY = "x"; expect(names()).toEqual(["Gemini"]); process.env.GROQ_API_KEY = "y"; expect(names()).toEqual(["Groq", "Gemini"]);
    process.env.AI_ORDER = "gemini"; expect(names()).toEqual(["Gemini", "Groq"]); process.env.GROQ_MODEL = "m"; expect(aiProviders().find((p) => p.id === "groq")?.model).toBe("m");
  });
  it("AI_PROVIDER uses just that one provider, and nothing if its key is missing", () => {
    process.env.GROQ_API_KEY = "y"; process.env.GEMINI_API_KEY = "x"; process.env.AI_PROVIDER = "gemini"; expect(names()).toEqual(["Gemini"]); process.env.AI_PROVIDER = "openrouter"; expect(names()).toEqual([]);
  });
  const reply = (status: number, text = "ok") => new Response(status === 200 ? JSON.stringify({ choices: [{ message: { role: "assistant", content: text } }] }) : "{}", { status, headers: status === 429 ? { "retry-after": "30" } : {} });
  it("switches to the next provider when one is out of quota, and skips the tired one next time", async () => {
    process.env.GROQ_API_KEY = "y"; process.env.GEMINI_API_KEY = "x"; const hits: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => { hits.push(new URL(u).hostname); return u.includes("groq") ? reply(429) : reply(200, "from gemini"); });
    expect((await complete([{ role: "user", content: "hi" }])).content).toBe("from gemini"); expect(hits).toEqual(["api.groq.com", "generativelanguage.googleapis.com"]);
    hits.length = 0; await complete([{ role: "user", content: "again" }]); expect(hits).toEqual(["generativelanguage.googleapis.com"]);
  });
  it("a single provider that is out of quota gives a clear 429, and never falls through to another", async () => {
    process.env.GROQ_API_KEY = "y"; process.env.GEMINI_API_KEY = "x"; process.env.AI_PROVIDER = "groq"; let n = 0;
    vi.stubGlobal("fetch", async () => { n++; return reply(429); });
    await expect(complete([{ role: "user", content: "hi" }])).rejects.toMatchObject({ status: 429 }); expect(n).toBe(1);
  });
  it("only offers money-owed lookups to finance roles, and every tool is read-only", () => {
    const names = (f: boolean) => TOOLS(f).map((t) => t.function.name);
    expect(names(false)).not.toContain("unpaid_invoices"); expect(names(true)).toContain("unpaid_invoices");
    expect(names(true).every((n) => !/^(add|create|update|delete|set|adjust)/.test(n))).toBe(true);
  });
});
import { signals, type Facts } from "../src/lib/pi"; import { siteFacts } from "../src/lib/kb"; import { PLANS } from "../src/lib/plans";
const base: Facts = { id: "p", name: "Cap", sku: "CAP", unit: "pcs", price: 249, cost: 80, gst: 12, description: "x", hasImage: true, available: 100, reserved: 0, reorderAt: 10, sold30: 30, soldPrev30: 30, sold90: 90, revenue90: 22410, perDay: 1, coverDays: 100, marginPct: 67.9, suggestReorder: 0, lastSoldDaysAgo: 1 };
describe("product intelligence", () => {
  it("warns before stock runs out and says how much to order", () => { const s = signals({ ...base, available: 5, coverDays: 5, suggestReorder: 25 }); expect(s[0].tone).toBe("warn"); expect(s[0].text).toContain("25"); });
  it("flags stock that isn't selling, a slowdown, a thin margin and a missing description", () => {
    const t = (f: Partial<Facts>) => signals({ ...base, ...f }).map((x) => x.text).join(" | ");
    expect(t({ sold30: 0, soldPrev30: 0, sold90: 0, perDay: 0, coverDays: null })).toContain("No sales in the last 90 days"); expect(t({ sold30: 4, soldPrev30: 20 })).toContain("slowed");
    expect(t({ price: 100, cost: 95, marginPct: 5 })).toContain("only 5%"); expect(t({ description: null })).toContain("No description yet");
  });
  it("calls out an out-of-stock best seller", () => { expect(signals({ ...base, available: 0, coverDays: 0 })[0].text).toContain("losing sales"); });
});
describe("website assistant facts", () => {
  it("quote the real plan prices and limits", () => { const k = siteFacts(); expect(k).toContain(`₹${PLANS.GROWTH.monthly.toLocaleString("en-IN")}`); expect(k).toContain(`${PLANS.FREE.members} team members`); expect(k).toContain("/contact"); });
});
