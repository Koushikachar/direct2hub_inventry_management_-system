/** Free AI, no SDK. Talks to any OpenAI-compatible chat endpoint. Set one key to use that provider, or several to use them together:
 *   GROQ_API_KEY       (console.groq.com, free)        model GROQ_MODEL       default openai/gpt-oss-120b
 *   GEMINI_API_KEY     (aistudio.google.com, free)     model GEMINI_MODEL     default gemini-3.5-flash-lite
 *   OPENROUTER_API_KEY (openrouter.ai, ":free" models) model OPENROUTER_MODEL default meta-llama/llama-3.3-70b-instruct:free
 *   AI_API_KEY + AI_BASE_URL + AI_MODEL: your own OpenAI-compatible server (Ollama, LM Studio, ...)
 *  AI_PROVIDER picks how they are used: "auto" (default) tries them in the order groq, gemini, openrouter, custom and SWITCHES to the next when one is out of
 *  quota or down; "groq" / "gemini" / "openrouter" / "custom" uses only that one (no switching). AI_ORDER (e.g. "gemini,groq") changes the order. */
export type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type Provider = { id: string; name: string; base: string; key: string; model: string; models: string[]; envVar: string };
/** Free-tier models change often (Groq removed the Llama models for free accounts on 16 Aug 2026, Google shut gemini-2.5-flash on 16 Oct 2026 and replaced gemini-3.5-flash with 3.6). A model set in *_MODEL goes first; if it, or the default, says "no longer available" the next one is tried and remembered. */
const FALLBACK: Record<string, string[]> = { groq: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"], gemini: ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"], openrouter: ["meta-llama/llama-3.3-70b-instruct:free"], custom: ["llama-3.3-70b-versatile"] };
const pick = (id: string, set?: string) => [...new Set([set?.trim(), ...FALLBACK[id]].filter((x): x is string => !!x))];
const ALL = ["groq", "gemini", "openrouter", "custom"];
/** The providers that have a key, in the order they will be tried. With AI_PROVIDER set to one name, only that one. */
/** Two jobs, two free AIs: "chat" (assistant + website bubble) defaults to Groq, "product" (descriptions + Product Intelligence) defaults to Gemini.
 *  Override with AI_CHAT_PROVIDER / AI_PRODUCT_PROVIDER. If the preferred one has no key or fails, the others still answer. */
export type Role = "chat" | "product";
const ROLE_DEFAULT: Record<Role, string> = { chat: "groq", product: "gemini" };
export function aiProviders(env: Record<string, string | undefined> = process.env, role?: Role): Provider[] {
  const clean = (v?: string) => (v ?? "").trim().replace(/^["']+|["']+$/g, "").trim() || undefined;
  const e = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, /KEY|MODEL|BASE_URL/.test(k) ? clean(v) : v])) as Record<string, string | undefined>, has: Record<string, Provider | null> = {
    groq: e.GROQ_API_KEY ? { id: "groq", name: "Groq", base: "https://api.groq.com/openai/v1", key: e.GROQ_API_KEY, models: pick("groq", e.GROQ_MODEL), model: pick("groq", e.GROQ_MODEL)[0], envVar: "GROQ_MODEL" } : null,
    gemini: e.GEMINI_API_KEY ? { id: "gemini", name: "Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", key: e.GEMINI_API_KEY, models: pick("gemini", e.GEMINI_MODEL), model: pick("gemini", e.GEMINI_MODEL)[0], envVar: "GEMINI_MODEL" } : null,
    openrouter: e.OPENROUTER_API_KEY ? { id: "openrouter", name: "OpenRouter", base: "https://openrouter.ai/api/v1", key: e.OPENROUTER_API_KEY, models: pick("openrouter", e.OPENROUTER_MODEL), model: pick("openrouter", e.OPENROUTER_MODEL)[0], envVar: "OPENROUTER_MODEL" } : null,
    custom: e.AI_API_KEY && e.AI_BASE_URL ? { id: "custom", name: "Custom", base: e.AI_BASE_URL.replace(/\/$/, ""), key: e.AI_API_KEY, models: pick("custom", e.AI_MODEL), model: pick("custom", e.AI_MODEL)[0], envVar: "AI_MODEL" } : null,
  };
  const only = (e.AI_PROVIDER ?? "").trim().toLowerCase(); if (only && only !== "auto") return has[only] ? [has[only]!] : [];
  const order = [...new Set([...(e.AI_ORDER ?? "").toLowerCase().split(",").map((x) => x.trim()).filter((x) => ALL.includes(x)), ...ALL])];
  const list = order.map((k) => has[k]).filter((x): x is Provider => !!x);
  if (!role) return list;
  const want = (env[`AI_${role.toUpperCase()}_PROVIDER`] ?? "").trim().toLowerCase() || ROLE_DEFAULT[role], first = list.find((p) => p.id === want);
  return first ? [first, ...list.filter((p) => p !== first)] : list;
}
export const aiReady = () => aiProviders().length > 0;
/** Short label for the screen, e.g. "Groq, then Gemini if it runs out" or "Gemini". */
export const aiLabel = (role?: Role) => { const p = aiProviders(process.env, role); return p.length > 1 ? `${p[0].name}, then ${p.slice(1).map((x) => x.name).join(", ")} if it runs out` : p[0]?.name ?? ""; };
export class AiError extends Error { constructor(public status: number, m: string) { super(m); } }
export const NOT_SET = "The AI assistant isn't set up yet. Add GROQ_API_KEY or GEMINI_API_KEY (both free) to the server settings.";
const found = new Map<string, string[]>(); // provider -> models its own /models list says are usable right now
/** Asks the provider which models exist today (names change often), keeps chat-capable ones, best first. */
async function discover(p: Provider): Promise<string[]> {
  if (found.has(p.id)) return found.get(p.id)!;
  let ids: string[] = [];
  try {
    const r = await fetch(`${p.base}/models`, { headers: { Authorization: `Bearer ${p.key}` }, signal: AbortSignal.timeout(8_000) });
    const j = r.ok ? ((await r.json().catch(() => null)) as { data?: { id?: string }[] } | null) : null;
    ids = (j?.data ?? []).map((m) => String(m.id ?? "").replace(/^models\//, "")).filter((id) => id && !/whisper|tts|guard|embed|image|imagen|veo|live|audio|vision-preview|orpheus|transcribe|moderation|aqa|robotics|computer-use/i.test(id));
  } catch { /* offline: fall back to the built-in names */ }
  const rank = (id: string) => (p.id === "groq" ? [/gpt-oss-120b/, /llama-3\.3-70b/, /llama-4/, /gpt-oss-20b/, /qwen/, /llama/] : p.id === "gemini" ? [/flash-lite$/, /gemini-3\.[56]-flash$/, /flash/, /gemini/] : [/:free$/]).findIndex((re) => re.test(id)), good = ids.filter((id) => rank(id) >= 0).sort((a, b) => rank(a) - rank(b) || b.localeCompare(a));
  if (good.length) found.set(p.id, good.slice(0, 4)); return good.slice(0, 4);
}
const cool = new Map<string, number>(); // provider -> time before which we skip it (it just said it is out of quota, or is down)
export const resetCooldowns = () => { cool.clear(); dead.clear(); found.clear(); };
const wait = (id: string, secs: number) => cool.set(id, Date.now() + Math.min(900, Math.max(5, secs)) * 1000);
/** One chat-completion call. If a provider is out of quota (429), rejects the key (401/403), errors (5xx) or times out, the next configured one answers instead.
 *  A provider that failed is skipped for a while, so the following questions don't wait on it again. */
const dead = new Set<string>(); // "provider:model" pairs that answered 404 / "no longer available": skipped from then on
const why = (body: string) => { try { const j = JSON.parse(body); const m = j?.error?.message ?? j?.[0]?.error?.message ?? j?.message; if (m) return String(m).replace(/\s+/g, " ").slice(0, 200); } catch { /* not JSON */ } return body.replace(/\s+/g, " ").slice(0, 200); };
const isGone = (status: number, body: string) => status === 404 || (status === 400 && /model/i.test(body) && /(not found|no longer|decommission|not supported|does not exist|invalid)/i.test(body));
export async function complete(messages: Msg[], o: { tools?: ToolDef[]; temperature?: number; maxTokens?: number; role?: Role } = {}): Promise<Msg> {
  const all = aiProviders(process.env, o.role); if (!all.length) throw new AiError(503, NOT_SET);
  const live = all.filter((p) => (cool.get(p.id) ?? 0) <= Date.now()), tryList = live.length ? live : all; // everyone is resting: try them anyway
  let quota = false, last: AiError | null = null;
  providers: for (const p of tryList) {
    let models = p.models.filter((m) => !dead.has(`${p.id}:${m}`));
    if (!models.length) models = (await discover(p)).filter((m) => !dead.has(`${p.id}:${m}`)); // every built-in name is gone: ask the provider what exists today
    if (!models.length) models = p.models;
    for (const model of models) {
      let r: Response;
      const reasoning = /gpt-oss/.test(model); // reasoning models spend part of max_tokens thinking: keep it short and leave room for the answer
      try {
        r = await fetch(`${p.base}/chat/completions`, { method: "POST", signal: AbortSignal.timeout(tryList.length > 1 ? 18_000 : 28_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
          body: JSON.stringify({ model, messages, temperature: o.temperature ?? 0.3, max_tokens: (o.maxTokens ?? 900) + (reasoning ? 1200 : 0), ...(reasoning && p.id === "groq" ? { reasoning_effort: "low" } : {}), ...(o.tools?.length ? { tools: o.tools, tool_choice: "auto" } : {}) }) });
      } catch { wait(p.id, 20); last = new AiError(504, "The AI service took too long to answer. Please try again."); continue providers; }
      if (r.status === 429) { quota = true; if (p.id === "gemini" && model !== models[models.length - 1]) continue; wait(p.id, Number(r.headers.get("retry-after")) || 60); continue providers; } // Gemini limits each model separately: try its next model first
      if (r.status === 401 || r.status === 403) { console.error(`[ai] ${p.name} rejected the key (${r.status})`); wait(p.id, 600); last = new AiError(502, `The ${p.name} key was rejected (${r.status}). Check ${p.id === "groq" ? "GROQ_API_KEY" : p.id === "gemini" ? "GEMINI_API_KEY" : "the key"} in the server settings.`); continue providers; }
      if (r.status >= 500) { console.error(`[ai] ${p.name} server error ${r.status}`); wait(p.id, 20); last = new AiError(502, "The AI service is having trouble. Please try again."); continue providers; }
      if (!r.ok) {
        const body = (await r.text().catch(() => "")).slice(0, 400); console.error(`[ai] ${p.name} / ${model} answered ${r.status}: ${body}`);
        if (isGone(r.status, body)) { dead.add(`${p.id}:${model}`); last = new AiError(502, `The ${p.name} model "${model}" is no longer available. Set ${p.envVar} to a current model name.`); continue; } // try this provider's next model
        last = new AiError(502, `${p.name} said: ${why(body) || `error ${r.status}`}`); continue providers; // e.g. 400: this provider didn't like the request, another might
      }
      const j = (await r.json().catch(() => null)) as { choices?: { message?: Msg }[] } | null, m = j?.choices?.[0]?.message;
      if (m && (m.content || m.tool_calls?.length)) { cool.delete(p.id); return m; }
      console.error(`[ai] ${p.name} / ${model} sent an empty answer`); last = new AiError(502, "The AI service sent an empty answer. Please try again."); continue providers;
    }
  }
  throw quota && !last ? new AiError(429, all.length > 1 ? "All the free AI quotas are used up for now. Try again in a few minutes." : "The free AI quota is used up for now. Wait a minute and try again, or add a second free key.") : last ?? new AiError(502, "The AI service couldn't answer. Please try again.");
}
const LANGS: Record<string, string> = { en: "English", hi: "Hindi (Devanagari script)", kn: "Kannada" };
export const langName = (l?: string) => LANGS[l ?? "en"] ?? "English";
/** Catalog copy for one product. Only the facts given are used: nothing is invented (no fake specs, materials or claims). */
export async function describeProduct(p: { name: string; sku?: string; unit?: string; notes?: string; language?: string }) {
  const sys = `You write product descriptions for a small business's online catalog. Write in ${langName(p.language)}. Output ONLY the description as plain text: no title, no markdown, no quotes. 45 to 80 words, 2 or 3 short sentences, friendly and clear. Use only the facts given. Never invent specifications, materials, sizes, certifications, warranties, discounts or claims. If few facts are given, stay general and honest.`;
  const facts = [`Product name: ${p.name}`, p.sku && `SKU: ${p.sku}`, p.unit && `Sold per: ${p.unit}`, p.notes && `Seller's notes (facts to use): ${p.notes}`].filter(Boolean).join("\n");
  const m = await complete([{ role: "system", content: sys }, { role: "user", content: facts }], { temperature: 0.6, maxTokens: 300, role: "product" });
  return (m.content ?? "").replace(/^["'\s]+|["'\s]+$/g, "").replace(/\*\*/g, "").slice(0, 1500);
}
