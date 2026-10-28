import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { complete, resetCooldowns } from "@/lib/ai";
const env = { ...process.env };
beforeEach(() => { resetCooldowns(); for (const k of ["GROQ_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "AI_API_KEY", "AI_PROVIDER", "AI_ORDER", "GROQ_MODEL"]) delete process.env[k]; });
afterEach(() => { vi.restoreAllMocks(); process.env = { ...env }; });
const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), { status: 200 });
describe("AI model fallback", () => {
  it("moves to the next model when one is retired (404) and remembers it", async () => {
    process.env.GROQ_API_KEY = "k"; process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    const used: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { const m = JSON.parse(String(init.body)).model as string; used.push(m); return m === "llama-3.3-70b-versatile" ? new Response('{"error":{"message":"The model has been decommissioned"}}', { status: 404 }) : reply("hello"); }));
    expect((await complete([{ role: "user", content: "hi" }])).content).toBe("hello");
    expect(used).toEqual(["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]);
    used.length = 0; await complete([{ role: "user", content: "again" }]);
    expect(used).toEqual(["openai/gpt-oss-120b"]); // the retired one is skipped now
  });
  it("tells the person which model is gone when every model is retired", async () => {
    process.env.GEMINI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await expect(complete([{ role: "user", content: "hi" }])).rejects.toThrow(/no longer available/);
  });
});
