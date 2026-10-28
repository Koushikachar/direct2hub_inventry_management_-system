import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Role } from "@prisma/client";
import { db } from "./db";

type AuthState = { au: { id: string; email: string; confirmed: boolean; name: string } | null; pending: boolean; aal2: boolean };
/** Who is calling, and has a second factor been proven? Middleware verifies the session once and passes the result in headers it always overwrites (client-sent copies are deleted). */
async function authState(): Promise<AuthState> {
  const hs = await headers(), uid = hs.get("x-d2h-uid");
  if (uid) return { au: { id: uid, email: hs.get("x-d2h-email") ?? "", confirmed: hs.get("x-d2h-ok") === "1", name: decodeURIComponent(hs.get("x-d2h-name") ?? "") }, pending: hs.get("x-d2h-mfa") === "1", aal2: hs.get("x-d2h-aal") === "aal2" };
  // fallback if a request somehow skipped middleware: ask Supabase directly (and fail closed if the second-factor check can't be made)
  const store = await cookies();
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => store.getAll(), setAll: () => {} } });
  const u = (await sb.auth.getUser()).data.user; if (!u) return { au: null, pending: false, aal2: false };
  let pending = false, aal2 = false;
  if ((u.factors ?? []).some((f) => f.status === "verified")) { const a = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data; aal2 = a?.currentLevel === "aal2"; pending = !aal2; }
  return { au: { id: u.id, email: u.email ?? "", confirmed: !!u.email_confirmed_at, name: String(u.user_metadata?.name ?? "") }, pending, aal2 };
}
const state = cache(authState);
/** True when the person is signed in with a password but still owes the 6-digit code. Everywhere else getUser() treats that session as signed out. */
export const mfaPending = async () => { const s = await state(); return !!s.au && s.au.confirmed && s.pending; };

async function loadUser() {
  const s = await state(), au = s.au;
  if (!au || !au.email || !au.confirmed) return null; // unverified emails are never treated as signed in
  if (s.pending) return null; // a password alone is not enough for accounts with two-step sign-in turned on
  const email = au.email.toLowerCase(), inc = { memberships: { include: { org: true }, orderBy: { id: "asc" as const } } };
  const found = await db.user.findUnique({ where: { authId: au.id }, include: inc }); if (found) return Object.assign(found, { aal2: s.aal2 });
  const old = await db.user.findUnique({ where: { email } });
  if (old) return Object.assign(await db.user.update({ where: { id: old.id }, data: { authId: au.id }, include: inc }), { aal2: s.aal2 }); // same verified email, e.g. after a Supabase project change
  try { return Object.assign(await db.user.create({ data: { authId: au.id, email, name: au.name || null }, include: inc }), { aal2: s.aal2 }); }
  catch { const again = await db.user.findUnique({ where: { authId: au.id }, include: inc }); return again ? Object.assign(again, { aal2: s.aal2 }) : null; } // lost a race with a parallel request
}

export const isAdminEmail = (e?: string | null) => !!e && (process.env.PLATFORM_ADMIN_EMAILS ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean).includes(e.toLowerCase());
export async function isOperator(user: { id: string; email: string; memberships?: { role: string }[] }) {
  if (isAdminEmail(user.email)) return true;
  if (user.memberships) return user.memberships.some((m) => m.role === "PLATFORM_OPERATOR");
  return !!(await db.membership.findFirst({ where: { userId: user.id, role: "PLATFORM_OPERATOR" } }));
}

export const getUser = cache(loadUser); // one Supabase lookup per request
