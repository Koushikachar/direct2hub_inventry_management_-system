import { ctx } from "@/lib/ctx"; import { aiProviders } from "@/lib/ai";
export const dynamic = "force-dynamic"; export const maxDuration = 45;
/** Open /api/ai/status while signed in: tests every configured AI key with one tiny request and says exactly what each provider answered. No keys are shown. */
export async function GET() {
  try { await ctx(); } catch { return Response.json({ error: "Sign in first" }, { status: 401 }); }
  const ps = aiProviders(); if (!ps.length) return Response.json({ configured: [], problem: "No AI key is visible to the server. Put GROQ_API_KEY / GEMINI_API_KEY in .env.local (or the host's environment settings) and restart." });
  const out = [];
  for (const p of ps) {
    const row: Record<string, unknown> = { provider: p.id, keyLength: p.key.length, keyStart: p.key.slice(0, 4) + "…" };
    try {
      const m = await fetch(`${p.base}/models`, { headers: { Authorization: `Bearer ${p.key}` }, signal: AbortSignal.timeout(10_000) });
      row.modelsStatus = m.status; const j = (await m.json().catch(() => null)) as { data?: { id?: string }[]; error?: { message?: string } } | null;
      row.models = (j?.data ?? []).map((x) => String(x.id).replace(/^models\//, "")).filter((id) => /gpt-oss|llama|gemini|qwen/i.test(id)).slice(0, 12); if (!m.ok) row.modelsError = j?.error?.message ?? "see status";
      for (const model of p.models) {
        const r = await fetch(`${p.base}/chat/completions`, { method: "POST", signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` }, body: JSON.stringify({ model, messages: [{ role: "user", content: "Say OK" }], max_tokens: 300 }) });
        const t = (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 220);
        (row.tries as unknown[] | undefined) ? (row.tries as unknown[]).push({ model, status: r.status, reply: r.ok ? "works" : t }) : (row.tries = [{ model, status: r.status, reply: r.ok ? "works" : t }]);
        if (r.ok) { row.works = model; break; }
      }
    } catch (e) { row.networkError = e instanceof Error ? e.message : String(e); }
    out.push(row);
  }
  return Response.json({ configured: out });
}
