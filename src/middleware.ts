import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
type CookieToSet = { name: string; value: string; options?: any };
const opts = (o?: any) => ({ ...o, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const });
/** One Supabase check per request: refreshes the session cookie, and hands the verified identity to the page in headers (so pages don't call Supabase again).
 *  Any x-d2h-* header sent by a client is deleted first, so only this middleware can set them. */
export async function middleware(req: NextRequest) {
  const toSet: CookieToSet[] = [];
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (l: CookieToSet[]) => { l.forEach(({ name, value }) => req.cookies.set(name, value)); toSet.push(...l); }
    }
  });
  const got = await sb.auth.getUser().catch((e: unknown) => ({ data: { user: null }, error: e as { code?: string; message?: string } })), u = got.data.user;
  // A leftover sign-in cookie whose refresh token no longer exists (signed out elsewhere, session revoked, or a different Supabase project) is treated as signed out and cleared once, instead of failing on every request.
  const staleCookies = !u && /refresh_token_not_found|already_used|invalid refresh token/i.test(`${got.error?.code ?? ""} ${got.error?.message ?? ""}`) ? req.cookies.getAll().map((c) => c.name).filter((n) => /^sb-.+-auth-token(\.\d+)?$/.test(n)) : [];
  staleCookies.forEach((n) => req.cookies.delete(n));
  const h = new Headers(req.headers);
  ["x-d2h-uid", "x-d2h-email", "x-d2h-ok", "x-d2h-name", "x-d2h-mfa", "x-d2h-aal"].forEach((k) => h.delete(k));
  if (u) {
    // Two-step sign-in: if this account has a verified authenticator, the session must have passed the code check (aal2). If the check itself fails, assume it has not (fail closed).
    let aal = "aal1", pending = false;
    if ((u.factors ?? []).some((f) => f.status === "verified")) { try { aal = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel ?? "aal1"; } catch { aal = "aal1"; } pending = aal !== "aal2"; }
    h.set("x-d2h-mfa", pending ? "1" : "0"); h.set("x-d2h-aal", aal);
    h.set("x-d2h-uid", u.id); h.set("x-d2h-email", u.email ?? ""); h.set("x-d2h-ok", u.email_confirmed_at ? "1" : "0"); h.set("x-d2h-name", encodeURIComponent(String(u.user_metadata?.name ?? "")));
  }
  const res = NextResponse.next({ request: { headers: h } });
  toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, opts(options)));
  staleCookies.forEach((n) => res.cookies.set(n, "", opts({ path: "/", maxAge: 0 })));
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
