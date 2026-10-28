"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getUser, mfaPending } from "@/lib/auth";
import { sbServer } from "@/lib/supabase";
import { allow } from "@/lib/ratelimit";

/** Two-step sign-in with an authenticator app (TOTP), using Supabase Auth's MFA. Codes are checked by Supabase; this file only adds rate limits, audit rows and redirects.
 *  Needs "Multi-factor authentication (TOTP)" enabled in Supabase > Authentication > Sign In / Providers (it is on by default). */
export type Enroll = { ok: true; factorId: string; qr: string; secret: string } | { ok: false; error: string };
const code6 = (v: FormDataEntryValue | null) => { const s = String(v ?? "").replace(/\s+/g, ""); return /^\d{6}$/.test(s) ? s : null; };
const ipOf = async () => (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "local";
const back = (path: string, k: "e" | "ok", m: string): never => redirect(`${path}?${k}=${encodeURIComponent(m)}`);
const audit = (actorId: string, action: string) => db.auditLog.create({ data: { actorId, action } }).catch(() => {});

/** Step 1 of setup: creates a pending authenticator and returns the QR code once. Nothing is switched on until the first code is confirmed. */
export async function enrollMfa(): Promise<Enroll> {
  const u = await getUser(); if (!u) return { ok: false, error: "Please sign in again." };
  if (!(await allow(`mfa-enroll:${u.id}`, 5, 3600_000))) return { ok: false, error: "Too many attempts. Try again in an hour." };
  const sb = await sbServer(), list = await sb.auth.mfa.listFactors();
  if ((list.data?.totp ?? []).length) return { ok: false, error: "Two-step sign-in is already on." };
  for (const f of list.data?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id }); // clear abandoned setups
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", issuer: "Direct2Hub", friendlyName: `Authenticator ${Date.now()}` });
  if (error || !data) return { ok: false, error: "Couldn't start setup. Try again in a minute." };
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}
/** Step 2: the first code proves the app is set up. The session is upgraded to the second level at the same time. */
export async function confirmMfa(fd: FormData) {
  const u = await getUser(); if (!u) redirect("/login");
  const code = code6(fd.get("code")), factorId = String(fd.get("factorId") ?? "");
  if (!code || !/^[0-9a-f-]{36}$/i.test(factorId)) back("/security", "e", "Enter the 6-digit code from your authenticator app.");
  if (!(await allow(`mfa-confirm:${u.id}`, 8, 15 * 60_000))) back("/security", "e", "Too many wrong codes. Wait 15 minutes and try again.");
  const { error } = await (await sbServer()).auth.mfa.challengeAndVerify({ factorId, code: code! });
  if (error) back("/security", "e", "That code didn't work. Check that your phone's clock is automatic, then try the next code.");
  await audit(u.id, "mfa.enabled"); back("/security", "ok", "Two-step sign-in is on. You'll be asked for a code each time you sign in.");
}
/** The sign-in screen's code check. Only reachable by someone who already passed the password step. */
export async function submitMfa(fd: FormData) {
  if (!(await mfaPending())) redirect("/login");
  const code = code6(fd.get("code")); if (!code) back("/mfa", "e", "Enter the 6-digit code.");
  const sb = await sbServer(), user = (await sb.auth.getUser()).data.user; if (!user) redirect("/login");
  if (!(await allow(`mfa:${user!.id}`, 5, 15 * 60_000)) || !(await allow(`mfa-ip:${await ipOf()}`, 20, 15 * 60_000))) back("/mfa", "e", "Too many attempts. Wait 15 minutes and try again.");
  const factor = (await sb.auth.mfa.listFactors()).data?.totp?.[0]; if (!factor) back("/mfa", "e", "No authenticator found. Use a different account, or contact support.");
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor!.id, code: code! });
  if (error) { await audit(user!.id, "mfa.failed"); back("/mfa", "e", "That code didn't work. Try the next one."); }
  redirect("/dashboard");
}
/** Turning it off needs a session that already passed the code check (Supabase enforces this too). */
export async function disableMfa(fd: FormData) {
  const u = await getUser(); if (!u) redirect("/login");
  const factorId = String(fd.get("factorId") ?? ""); if (!/^[0-9a-f-]{36}$/i.test(factorId)) back("/security", "e", "Unknown authenticator.");
  if (!u.aal2) back("/security", "e", "Sign out and sign in again with your code first.");
  const { error } = await (await sbServer()).auth.mfa.unenroll({ factorId });
  if (error) back("/security", "e", "Couldn't turn it off. Sign out, sign in with your code, and try again.");
  await audit(u.id, "mfa.disabled"); back("/security", "ok", "Two-step sign-in is off.");
}
