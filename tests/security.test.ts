// Static guards for the rules in SECURITY_AUDIT.md. They read the source, so they catch a route or action added later without a check.
// They do NOT replace a two-account isolation test against a real database (see the audit's "manual" list).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { bearerOk } from "../src/lib/cronauth";
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const norm = (p: string) => p.split("\\").join("/");
const src = walk("src").map(norm), read = (f: string) => readFileSync(f, "utf8");
const routes = src.filter((f) => /\/api\/.*\/route\.ts$/.test(f));

// What each API route must do before touching data: signed-in session, API key, cron secret, a verified provider signature, or a provider re-check.
const PROOF = /\b(ctx\(|ownerOrError\(|apiAuth\(|bearerOk\(|verifyRazorpayWebhook\(|verifyStripeSignature\(|verifyRazorpayLink\(|verifyRazorpayOrder\(|verifyRazorpaySubscription\(|getStripeSession\(|getUser\()/;
describe("API routes", () => {
  it("finds the routes", () => { expect(routes.length).toBeGreaterThan(15); });
  // The only route open to anyone: the website chat. It is allowed because it never reads an account's data (no database, no session) and is rate limited per visitor.
  const PUBLIC = ["src/app/api/ai/public/route.ts"];
  it("every route proves who is calling before it does anything", () => { expect(routes.filter((f) => !PUBLIC.includes(f) && !PROOF.test(read(f)))).toEqual([]); });
  it("the one public route (website chat) touches no account data and is rate limited", () => { for (const f of PUBLIC) { const t = read(f); expect(/@\/lib\/(db|ctx|auth)\b/.test(t), f).toBe(false); expect(t.includes("allow("), f).toBe(true); expect(t.includes("siteFacts()"), f).toBe(true); } });
  it("cron routes use the constant-time bearer check", () => { for (const f of routes.filter((r) => r.includes("/api/cron/"))) { const t = read(f); expect(t.includes("bearerOk(req)"), f).toBe(true); expect(/CRON_SECRET/.test(t.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), `${f} compares the secret itself`).toBe(false); } });
  it("signed-in downloads set no-store so a shared cache can't keep them", () => { for (const f of routes.filter((r) => /\/(export|eway)\//.test(r) || /export\/route/.test(r))) expect(read(f).includes("no-store"), f).toBe(true); });
  it("webhooks from providers read the raw body once and verify the signature before parsing", () => { for (const f of routes.filter((r) => /webhook/.test(r) && !r.includes("/cron/"))) { const t = read(f), v = t.search(/verify(Razorpay|Stripe)/), j = t.indexOf("JSON.parse"); expect(v, f).toBeGreaterThan(-1); expect(v < j, `${f} parses before verifying`).toBe(true); } });
});
describe("admin area", () => {
  it("every admin page and action starts with adminGuard()", () => { const files = src.filter((f) => f.includes("(app)/admin/") && /(page|actions)\.tsx?$/.test(f)); expect(files.length).toBeGreaterThan(5); expect(files.filter((f) => !read(f).includes("adminGuard("))).toEqual([]); });
  it("operators need the second factor unless explicitly switched off", () => { expect(read("src/lib/admin.ts")).toMatch(/ADMIN_REQUIRE_MFA !== "0"/); expect(read("src/lib/admin.ts")).toMatch(/!u\.aal2/); });
});
describe("server actions", () => {
  it("every 'use server' file checks the session, a role, or the sign-in flow", () => {
    const files = src.filter((f) => /\.tsx?$/.test(f) && /^\s*["']use server["']/.test(read(f)));
    expect(files.length).toBeGreaterThan(3);
    expect(files.filter((f) => !/\b(ctx\(|guard\(|getUser\(|adminGuard\(|ownerOrError\(|sbServer\(|mfaPending\()/.test(read(f)))).toEqual([]);
  });
  it("tenant data is always read through the session's org, never an org id from the browser", () => {
    for (const f of src.filter((x) => /\/(actions|pay-actions)\.ts$/.test(x) && !x.includes("/admin/"))) { const t = read(f); expect(/get\("orgId"\)|fd\.get\('orgId'\)|body\.orgId|params\.orgId/.test(t), `${f} trusts a client orgId`).toBe(false); }
  });
});
describe("sessions", () => {
  it("actions that join or create an organization use getUser(), which enforces a verified email and the second step", () => {
    const t = read("src/app/actions.ts");
    for (const fn of ["createOrg", "acceptInvite"]) { const i = t.indexOf(`export async function ${fn}`), body = t.slice(i, t.indexOf("\nexport async function", i + 10)); expect(body, fn).toMatch(/await getUser\(\)/); expect(body.includes("auth.getUser()"), `${fn} reads the raw Supabase session`).toBe(false); }
  });
});
describe("secrets and dangerous sinks", () => {
  const code = src.filter((f) => /\.(ts|tsx|js)$/.test(f));
  it("only the safe NEXT_PUBLIC_ variables exist", () => { const ok = new Set(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SITE_URL", "TURNSTILE_SITE_KEY", "COMPANY_NAME", "CONTACT_EMAIL", "COMPANY_ADDRESS", "GA_ID", "GSC_VERIFICATION"]); const bad = new Set<string>(); for (const f of code) for (const m of read(f).matchAll(/NEXT_PUBLIC_([A-Z0-9_]+)/g)) if (!ok.has(m[1])) bad.add(m[1]); expect([...bad]).toEqual([]); });
  it("the service-role key and payment secrets never appear in client components", () => { for (const f of code.filter((x) => /^\s*["']use client["']/.test(read(x)))) expect(/SERVICE_ROLE|KEY_SECRET|WEBHOOK_SECRET|APP_ENC_KEY|SMTP_PASS|GMAIL_APP_PASSWORD|CRON_SECRET/.test(read(f)), f).toBe(false); });
  it("no raw-SQL-from-string, eval or raw HTML injection", () => { for (const f of code.filter((x) => !x.endsWith("components/JsonLd.tsx"))) { const t = read(f); expect(/\$queryRawUnsafe|\$executeRawUnsafe|dangerouslySetInnerHTML|\beval\(|new Function\(/.test(t.replace(/\/\/.*$/gm, "")), f).toBe(false); }
    // The one allowed exception: JSON-LD for search engines, whose "<" is escaped (proved in seo.test.ts) so it can't break out of its script tag.
    expect(read("src/lib/seo.ts")).toMatch(/\\u003c/); });
  it("middleware deletes every x-d2h-* identity header a client could send", () => { const t = read("src/middleware.ts"); for (const h of ["x-d2h-uid", "x-d2h-email", "x-d2h-ok", "x-d2h-name", "x-d2h-mfa", "x-d2h-aal"]) expect(t.split(h).length - 1, h).toBeGreaterThanOrEqual(2); });
  it("session cookies are HttpOnly, Secure in production and SameSite=Lax", () => { for (const f of ["src/middleware.ts", "src/lib/supabase.ts"]) { const t = read(f); expect(t).toMatch(/httpOnly: true/); expect(t).toMatch(/sameSite: "lax"/); expect(t).toMatch(/secure: process\.env\.NODE_ENV === "production"/); } });
  it(".env files are ignored and .env.example holds no values", () => { const g = read(".gitignore"); expect(g).toMatch(/^\.env$/m); expect(g).toMatch(/^\.env\.\*$/m); expect(g).toMatch(/^!\.env\.example$/m);
    for (const l of read(".env.example").split("\n")) { const m = /^([A-Z0-9_]+)="(.*?)"/.exec(l); if (m && /SECRET|PASSWORD|PASS|TOKEN|SERVICE_ROLE|KEY(?!_ID)/.test(m[1]) && !/TURNSTILE/.test(m[1])) expect(m[2], m[1]).toBe(""); } });
  it("the database lock-down script covers every schema", () => { const t = read("supabase/rls-lockdown.sql"); expect(t).toMatch(/ENABLE ROW LEVEL SECURITY/); expect(t).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated/); });
  it("ships a CI workflow with read-only permissions and a secret scan", () => { expect(existsSync(".github/workflows/ci.yml")).toBe(true); const t = read(".github/workflows/ci.yml"); expect(t).toMatch(/permissions:\s*\n\s*contents: read/); expect(t).toMatch(/gitleaks/); expect(t).toMatch(/npm audit/); });
});
describe("constant-time cron secret", () => {
  const req = (h?: string) => new Request("https://x.test/api/cron/daily", { headers: h ? { authorization: h } : {} });
  it("accepts the exact bearer value only", () => { expect(bearerOk(req("Bearer s3cret"), "s3cret")).toBe(true); expect(bearerOk(req("Bearer s3cret2"), "s3cret")).toBe(false); expect(bearerOk(req("bearer s3cret"), "s3cret")).toBe(false); expect(bearerOk(req(), "s3cret")).toBe(false); });
  it("refuses everything when no secret is configured", () => { expect(bearerOk(req("Bearer "), "")).toBe(false); expect(bearerOk(req("Bearer undefined"), undefined)).toBe(false); });
});
